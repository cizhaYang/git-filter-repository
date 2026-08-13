import * as vscode from 'vscode';
import * as path from 'node:path';
import { refreshRepositoryStatuses } from '../domain/repositoryActions';
import { getChangedRepositories } from '../domain/repositoryQueries';
import { getChangedRepositoriesMessage } from '../domain/repositoryViewState';
import { GitCli } from '../git/gitCli';
import { LocalGitRepository, type GitRepositoryLike } from '../git/localGitRepository';
import { WorkspaceRepositoryScanner } from '../git/workspaceRepositoryScanner';
import { RepositorySelectionState } from './repositorySelectionState';
import { RepositoryTreeItem } from './repositoryTreeItem';

export type ChangedRepositoriesTreeItem = RepositoryTreeItem;

export interface ChangedRepositoriesProviderOptions {
  workspaceRoots: readonly string[];
  scanner?: Pick<WorkspaceRepositoryScanner, 'scan'>
    & Partial<Pick<WorkspaceRepositoryScanner, 'scanWorkspaceRoots'>>;
  repositoryFactory?: (rootPath: string) => GitRepositoryLike;
}

// 超过这个数量时，初始化不能等待全部 Git status；先建立树视图，再在后台逐仓库刷新。
const ASYNC_STATUS_REFRESH_THRESHOLD = 32;

export class ChangedRepositoriesProvider implements vscode.TreeDataProvider<ChangedRepositoriesTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ChangedRepositoriesTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly repositorySubscriptions = new Map<string, vscode.Disposable[]>();
  private readonly pendingStatusRepositories = new Set<GitRepositoryLike>();
  private readonly repositories = new Map<string, GitRepositoryLike>();
  private readonly workspaceRoots: readonly string[];
  private readonly scanner: Pick<WorkspaceRepositoryScanner, 'scan'>
    & Partial<Pick<WorkspaceRepositoryScanner, 'scanWorkspaceRoots'>>;
  private readonly repositoryFactory: (rootPath: string) => GitRepositoryLike;
  private treeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private statusRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private repositoryScanTimer: ReturnType<typeof setTimeout> | undefined;
  private stateReconciliationTimer: ReturnType<typeof setInterval> | undefined;
  private repositoryStateSignature = '';
  private refreshAllStatuses = false;
  private gitAvailable = true;

  constructor(
    options: ChangedRepositoriesProviderOptions,
    private readonly selectionState: RepositorySelectionState,
    private readonly logger?: Pick<vscode.OutputChannel, 'appendLine'>,
    stateReconciliationIntervalMs = 1_000,
  ) {
    this.workspaceRoots = options.workspaceRoots;
    this.scanner = options.scanner ?? new WorkspaceRepositoryScanner({ logger });
    this.repositoryFactory = options.repositoryFactory ?? ((rootPath) => new LocalGitRepository(rootPath, new GitCli()));

    // 工作区级监听覆盖外部新建或删除的嵌套仓库；仓库级监听只负责已有仓库的 status 刷新。
    for (const workspaceRoot of this.workspaceRoots) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceRoot, '**/*'),
      );
      const scheduleScan = () => this.scheduleRepositoryScan();
      this.subscriptions.push(
        watcher,
        watcher.onDidCreate(scheduleScan),
        watcher.onDidDelete(scheduleScan),
      );
    }

    // 对账只读取本地 state 缓存，补偿 Git CLI 状态事件之外的 UI 刷新，不会额外启动 Git 进程。
    if (stateReconciliationIntervalMs > 0) {
      this.stateReconciliationTimer = setInterval(
        () => this.reconcileRepositoryState(),
        stateReconciliationIntervalMs,
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.scanner.scanWorkspaceRoots) {
      try {
        const workspaceRepositories = await this.scanner.scanWorkspaceRoots(this.workspaceRoots);
        if (workspaceRepositories.length > 0) {
          const repositories = this.replaceRepositories(workspaceRepositories);
          this.refresh();
          // 根仓库状态独立刷新，嵌套仓库扫描不会阻塞它进入 Changed Repositories。
          void this.refreshFromGitStatus(repositories);
        }
      } catch (error) {
        this.logger?.appendLine(`[scan] Unable to inspect workspace root repositories: ${String(error)}`);
      }
      // 全量扫描只补充嵌套仓库；大目录遍历放到后台，避免首次打开视图一直 loading。
      void this.refreshRepositories();
      return;
    }
    await this.refreshRepositories();
  }

  async refreshRepositories(): Promise<void> {
    let repositoryRoots: string[];
    try {
      repositoryRoots = await this.scanner.scan(this.workspaceRoots);
    } catch (error) {
      this.logger?.appendLine(`[scan] Unable to scan workspace repositories: ${String(error)}`);
      repositoryRoots = [];
    }

    const repositories = this.replaceRepositories(repositoryRoots);
    this.logger?.appendLine(`[activate] Watching ${this.repositories.size} workspace Git repositories.`);
    this.refresh();
    if (repositories.length > ASYNC_STATUS_REFRESH_THRESHOLD) {
      void this.refreshFromGitStatus(repositories);
      return;
    }
    await this.refreshFromGitStatus(repositories);
  }

  /**
   * 全量扫描结果与已有仓库对象合并，保留已完成的状态缓存和文件监听，避免后台扫描覆盖根仓库的首屏结果。
   */
  private replaceRepositories(repositoryRoots: readonly string[]): GitRepositoryLike[] {
    const nextRepositories = new Map<string, GitRepositoryLike>();
    for (const rootPath of repositoryRoots) {
      const key = path.normalize(path.resolve(rootPath));
      const existing = this.repositories.get(key);
      const repository = existing ?? this.repositoryFactory(key);
      nextRepositories.set(key, repository);
      if (!existing) {
        this.watchRepository(repository);
      }
    }

    for (const [key, repository] of this.repositories) {
      if (!nextRepositories.has(key)) {
        this.unwatchRepository(repository);
      }
    }

    this.repositories.clear();
    for (const [key, repository] of nextRepositories) {
      this.repositories.set(key, repository);
    }
    return [...this.repositories.values()];
  }

  /**
   * 合并连续的工作区结构变化（新建、删除、重命名）到一次后台全量扫描，
   * 避免每个文件事件都触发递归扫盘和全仓库 status 造成主线程抖动。
   */
  scheduleRepositoryScan(): void {
    if (this.repositoryScanTimer !== undefined) {
      return;
    }
    this.repositoryScanTimer = setTimeout(() => {
      this.repositoryScanTimer = undefined;
      void this.refreshRepositories();
    }, 150);
  }

  refresh(): void {
    this.cancelTreeRefresh();
    const repositories = [...this.repositories.values()];
    this.repositoryStateSignature = getRepositoryStateSignature(repositories);
    this.selectionState.reconcile(getChangedRepositories(repositories));
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  /**
   * 文件事件可能在一次保存中连续触发；延迟一个短周期合并刷新，避免嵌套仓库重复重建树。
   */
  scheduleRefresh(): void {
    if (this.treeRefreshTimer !== undefined) {
      return;
    }

    this.treeRefreshTimer = setTimeout(() => {
      this.treeRefreshTimer = undefined;
      this.refresh();
    }, 150);
  }

  /**
   * 编辑器保存事件只关联受影响的嵌套仓库，避免保存一个文件时触发全部仓库的 Git status。
   */
  scheduleStatusRefreshForUri(uri: vscode.Uri): void {
    const repositories = getDeepestRepositoriesForPath(uri.fsPath, [...this.repositories.values()]);
    if (repositories.length > 0) {
      this.logger?.appendLine(
        `[file] ${uri.fsPath} -> ${repositories.map((repository) => repository.rootUri.fsPath).join(', ')}`,
      );
      this.scheduleStatusRefresh(repositories);
    }
  }

  /**
   * 文件事件先让 Git 重新计算状态，再读取本地 state，解决外部修改没有 Git 事件的问题。
   */
  scheduleStatusRefresh(repositories?: readonly GitRepositoryLike[]): void {
    if (!repositories) {
      this.refreshAllStatuses = true;
    } else {
      for (const repository of repositories) {
        this.pendingStatusRepositories.add(repository);
      }
    }

    if (this.statusRefreshTimer !== undefined) {
      return;
    }

    this.statusRefreshTimer = setTimeout(() => {
      this.statusRefreshTimer = undefined;
      const repositoriesToRefresh = this.refreshAllStatuses
        ? undefined
        : [...this.pendingStatusRepositories];
      this.refreshAllStatuses = false;
      this.pendingStatusRepositories.clear();
      void this.refreshFromGitStatus(repositoriesToRefresh);
    }, 150);
  }

  async refreshFromGitStatus(repositories?: readonly GitRepositoryLike[]): Promise<void> {
    const repositoriesToRefresh = repositories ?? [...this.repositories.values()];
    this.logger?.appendLine(`[status] Refreshing ${repositoriesToRefresh.length} repositories (fast scan).`);
    try {
      // 先用 normal 避免大型仓库递归展开所有未跟踪文件；只有候选改动仓库才需要完整文件列表。
      await refreshRepositoryStatuses(repositoriesToRefresh, 'normal', () => this.scheduleRefresh());
      const changedRepositories = getChangedRepositories(repositoriesToRefresh);
      if (changedRepositories.length > 0) {
        this.logger?.appendLine(
          `[status] Loading full untracked files for ${changedRepositories.length} changed repositories.`,
        );
        await refreshRepositoryStatuses(changedRepositories, 'all', () => this.scheduleRefresh());
      }
      this.gitAvailable = true;
    } catch (error) {
      if (isGitUnavailable(error)) {
        this.gitAvailable = false;
      }
      this.logger?.appendLine(`Unable to refresh repository status: ${String(error)}`);
    }
    this.logger?.appendLine(`[status] Refresh completed for ${repositoriesToRefresh.length} repositories.`);
    this.refresh();
  }

  getMessage(): string | undefined {
    return getChangedRepositoriesMessage(
      {
        workspaceAvailable: this.workspaceRoots.length > 0,
        gitAvailable: this.gitAvailable,
      },
      getChangedRepositories([...this.repositories.values()]).length,
    );
  }

  getTreeItem(element: ChangedRepositoriesTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChangedRepositoriesTreeItem): ChangedRepositoriesTreeItem[] {
    if (element) {
      return [];
    }

    const items: RepositoryTreeItem[] = [];
    for (const repository of getChangedRepositories([...this.repositories.values()])) {
      try {
        items.push(new RepositoryTreeItem(
          repository,
          vscode.workspace.getWorkspaceFolder(repository.rootUri) ?? undefined,
        ));
      } catch (error) {
        this.logger?.appendLine(`Skipped repository ${repository.rootUri.fsPath}: ${String(error)}`);
      }
    }
    return items;
  }

  dispose(): void {
    this.cancelTreeRefresh();
    this.cancelStatusRefresh();
    if (this.repositoryScanTimer !== undefined) {
      clearTimeout(this.repositoryScanTimer);
      this.repositoryScanTimer = undefined;
    }
    if (this.stateReconciliationTimer !== undefined) {
      clearInterval(this.stateReconciliationTimer);
      this.stateReconciliationTimer = undefined;
    }
    this.onDidChangeTreeDataEmitter.dispose();
    for (const repository of this.repositories.values()) {
      this.unwatchRepository(repository);
    }
    this.repositories.clear();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions.length = 0;
  }

  private watchRepository(repository: GitRepositoryLike): void {
    const key = repository.rootUri.toString();
    if (this.repositorySubscriptions.has(key)) {
      return;
    }

    const subscriptions: vscode.Disposable[] = [];
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(repository.rootUri, '**/*'),
    );
    const onFileEvent = (uri: vscode.Uri) => {
      // 忽略 .git 元数据变化，避免 status 自身引起重复刷新循环。
      if (isGitMetadataPath(uri.fsPath)) {
        return;
      }
      this.scheduleStatusRefresh([repository]);
    };
    subscriptions.push(
      fileWatcher,
      fileWatcher.onDidChange(onFileEvent),
      fileWatcher.onDidCreate(onFileEvent),
      fileWatcher.onDidDelete(onFileEvent),
    );
    this.repositorySubscriptions.set(key, subscriptions);
    this.subscriptions.push(...subscriptions);
  }

  private unwatchRepository(repository: GitRepositoryLike): void {
    const key = repository.rootUri.toString();
    const subscriptions = this.repositorySubscriptions.get(key);
    if (!subscriptions) {
      return;
    }
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    this.repositorySubscriptions.delete(key);
  }

  private cancelTreeRefresh(): void {
    if (this.treeRefreshTimer === undefined) {
      return;
    }
    clearTimeout(this.treeRefreshTimer);
    this.treeRefreshTimer = undefined;
  }

  private cancelStatusRefresh(): void {
    if (this.statusRefreshTimer !== undefined) {
      clearTimeout(this.statusRefreshTimer);
      this.statusRefreshTimer = undefined;
    }
    this.pendingStatusRepositories.clear();
    this.refreshAllStatuses = false;
  }

  private reconcileRepositoryState(): void {
    const repositories = [...this.repositories.values()];
    const nextSignature = getRepositoryStateSignature(repositories);
    if (nextSignature === this.repositoryStateSignature) {
      return;
    }
    this.logger?.appendLine(`[state] Repository changes updated: ${getChangedRepositoriesSummary(repositories)}`);
    this.refresh();
  }
}

function isGitMetadataPath(filePath: string): boolean {
  return filePath.split(path.sep).includes('.git');
}

function isPathWithinRepository(filePath: string, repositoryRootPath: string): boolean {
  const relativePath = path.relative(repositoryRootPath, filePath);
  return relativePath === ''
    || (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`));
}

/**
 * 嵌套仓库中的文件只属于路径最深的仓库；父仓库也命中会造成重复 status 和多次刷新。
 */
function getDeepestRepositoriesForPath(
  filePath: string,
  repositories: readonly GitRepositoryLike[],
): GitRepositoryLike[] {
  const matchingRepositories = repositories.filter((repository) =>
    isPathWithinRepository(filePath, repository.rootUri.fsPath),
  );
  const deepestRootLength = matchingRepositories.reduce(
    (maxLength, repository) => Math.max(maxLength, repository.rootUri.fsPath.length),
    0,
  );
  return matchingRepositories.filter(
    (repository) => repository.rootUri.fsPath.length === deepestRootLength,
  );
}

function getRepositoryStateSignature(repositories: readonly GitRepositoryLike[]): string {
  return repositories
    .map((repository) => [
      repository.rootUri.fsPath,
      getChangesSignature(repository.state.indexChanges),
      getChangesSignature(repository.state.workingTreeChanges),
      getChangesSignature(repository.state.mergeChanges),
      getChangesSignature(repository.state.untrackedChanges ?? []),
    ].join(':'))
    .sort()
    .join('|');
}

function getChangesSignature(changes: readonly unknown[]): string {
  return changes.map(getChangeSignature).sort().join(',');
}

function getChangeSignature(change: unknown): string {
  if (!change || typeof change !== 'object') {
    return String(change);
  }
  const resource = change as {
    uri?: unknown;
    originalUri?: unknown;
    renameUri?: unknown;
    status?: unknown;
  };
  return [
    toStableString(resource.uri),
    toStableString(resource.originalUri),
    toStableString(resource.renameUri),
    toStableString(resource.status),
  ].join('~');
}

function toStableString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object' && 'fsPath' in value) {
    return String((value as { fsPath: unknown }).fsPath);
  }
  return String(value);
}

function getChangedRepositoriesSummary(repositories: readonly GitRepositoryLike[]): string {
  const changedRepositories = getChangedRepositories(repositories);
  return changedRepositories.length === 0
    ? 'none'
    : changedRepositories.map((repository) => repository.rootUri.fsPath).join(', ');
}

function isGitUnavailable(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code === 'ENOENT';
  }
  return String(error).includes('ENOENT');
}
