import * as vscode from 'vscode';
import * as path from 'node:path';
import { refreshRepositoryStatuses } from '../domain/repositoryActions';
import { getChangedRepositories } from '../domain/repositoryQueries';
import { getChangedRepositoriesMessage } from '../domain/repositoryViewState';
import type { GitApiLike, GitRepositoryLike } from '../git/gitExtension';
import { RepositorySelectionState } from './repositorySelectionState';
import { RepositoryTreeItem } from './repositoryTreeItem';

export type ChangedRepositoriesTreeItem = RepositoryTreeItem;

export class ChangedRepositoriesProvider implements vscode.TreeDataProvider<ChangedRepositoriesTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ChangedRepositoriesTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly repositorySubscriptions = new Map<string, vscode.Disposable[]>();
  private readonly pendingStatusRepositories = new Set<GitRepositoryLike>();
  private treeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private statusRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private stateReconciliationTimer: ReturnType<typeof setInterval> | undefined;
  private repositoryStateSignature = '';
  private refreshAllStatuses = false;

  constructor(
    private readonly gitApi: GitApiLike | undefined,
    private readonly selectionState: RepositorySelectionState,
    private readonly logger?: Pick<vscode.OutputChannel, 'appendLine'>,
    stateReconciliationIntervalMs = 1_000,
  ) {
    if (!gitApi) {
      this.logger?.appendLine('[activate] Built-in Git API is unavailable.');
      return;
    }

    for (const repository of gitApi.repositories) {
      this.watchRepository(repository);
    }
    this.selectionState.reconcile(getChangedRepositories(gitApi.repositories));
    this.repositoryStateSignature = getRepositoryStateSignature(gitApi.repositories);
    this.logger?.appendLine(`[activate] Watching ${gitApi.repositories.length} Git repositories.`);

    // 文件系统与 Git 状态事件都可能被 VS Code 合并；轻量对账只读取缓存，不额外执行 git status。
    if (stateReconciliationIntervalMs > 0) {
      this.stateReconciliationTimer = setInterval(
        () => this.reconcileRepositoryState(),
        stateReconciliationIntervalMs,
      );
    }

    // Git 状态和仓库列表都可能变化；这里把“刷新视图”和“管理仓库级监听”合并到同一组回调里。
    this.subscriptions.push(
      gitApi.onDidOpenRepository((repository) => {
        this.watchRepository(repository);
        this.refresh();
      }),
      gitApi.onDidCloseRepository((repository) => {
        this.unwatchRepository(repository);
        this.refresh();
      }),
    );
  }

  refresh(): void {
    this.cancelTreeRefresh();
    if (this.gitApi) {
      this.repositoryStateSignature = getRepositoryStateSignature(this.gitApi.repositories);
      this.selectionState.reconcile(getChangedRepositories(this.gitApi.repositories));
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  /**
   * 文件事件可能在一次保存中连续触发；延迟一个短周期合并刷新，避免嵌套仓库重复重建树。
   */
  scheduleRefresh(): void {
    if (!this.gitApi || this.treeRefreshTimer !== undefined) {
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
    if (!this.gitApi) {
      return;
    }

    const repositories = getDeepestRepositoriesForPath(uri.fsPath, this.gitApi.repositories);
    if (repositories.length > 0) {
      this.logger?.appendLine(
        `[file] ${uri.fsPath} -> ${repositories.map((repository) => repository.rootUri.fsPath).join(', ')}`,
      );
      this.scheduleStatusRefresh(repositories);
    }
  }

  /**
   * 文件事件触发时先让 Git 扫描工作区，再读取 state，解决 Git 状态事件未发出的情况。
   */
  scheduleStatusRefresh(repositories?: readonly GitRepositoryLike[]): void {
    if (!this.gitApi) {
      return;
    }

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
    if (!this.gitApi) {
      this.refresh();
      return;
    }

    const repositoriesToRefresh = repositories ?? this.gitApi.repositories;
    this.logger?.appendLine(`[status] Refreshing ${repositoriesToRefresh.length} repositories.`);
    try {
      await refreshRepositoryStatuses(repositoriesToRefresh);
    } catch (error) {
      this.logger?.appendLine(`Unable to refresh repository status: ${String(error)}`);
    }
    this.logger?.appendLine(`[status] Refresh completed for ${repositoriesToRefresh.length} repositories.`);
    this.refresh();
  }

  getMessage(): string | undefined {
    return getChangedRepositoriesMessage(
      Boolean(this.gitApi),
      this.gitApi ? getChangedRepositories(this.gitApi.repositories).length : 0,
    );
  }

  getTreeItem(element: ChangedRepositoriesTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChangedRepositoriesTreeItem): ChangedRepositoriesTreeItem[] {
    if (element || !this.gitApi) {
      return [];
    }

    const items: RepositoryTreeItem[] = [];

    for (const repository of getChangedRepositories(this.gitApi.repositories)) {
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

  private watchRepository(repository: GitRepositoryLike): void {
    const key = repository.rootUri.toString();
    if (this.repositorySubscriptions.has(key)) {
      return;
    }

    const subscriptions: vscode.Disposable[] = [];

    // 内置 Git API 把仓库状态事件挂在 state 上；status 完成后再刷新，才能读到最新文件列表。
    if (repository.state.onDidChange) {
      subscriptions.push(repository.state.onDidChange(() => this.scheduleRefresh()));
    }

    // Git 状态事件在不同场景下并不完全一致；仓库级文件监听覆盖编辑器外部修改和未跟踪文件创建。
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

  dispose(): void {
    this.cancelTreeRefresh();
    this.cancelStatusRefresh();
    if (this.stateReconciliationTimer !== undefined) {
      clearInterval(this.stateReconciliationTimer);
      this.stateReconciliationTimer = undefined;
    }
    this.onDidChangeTreeDataEmitter.dispose();
    this.repositorySubscriptions.clear();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
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
    if (!this.gitApi) {
      return;
    }

    const nextSignature = getRepositoryStateSignature(this.gitApi.repositories);
    if (nextSignature === this.repositoryStateSignature) {
      return;
    }

    this.logger?.appendLine(`[state] Repository changes updated: ${getChangedRepositoriesSummary(this.gitApi.repositories)}`);
    this.refresh();
  }
}

function isGitMetadataPath(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  return segments.includes('.git');
}

function isPathWithinRepository(filePath: string, repositoryRootPath: string): boolean {
  const relativePath = path.relative(repositoryRootPath, filePath);
  return relativePath === ''
    || (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`));
}

/**
 * 嵌套仓库中的文件只属于路径最深的仓库；父仓库也命中会造成重复 status 和原生 SCM 抖动。
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

/**
 * 签名只包含视图依赖的缓存字段，轮询不会访问磁盘，也不会触发新的 Git 进程。
 */
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
