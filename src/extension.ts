import * as vscode from 'vscode';
import { getChangeOpenPlan, getGitBlobRef } from './domain/changeOpenPlan';
import {
  hasStagedChanges,
  needsFallbackRefresh,
  runRepositoryAction,
  runRepositoryFileAction,
  runRepositoryFilesAction,
  shouldShowFileActionProgress,
  shouldShowFileActionSuccess,
  type RepositoryAction,
  type RepositoryFilesAction,
  type RepositoryFileAction,
} from './domain/repositoryActions';
import { getRepositoryDisplayName } from './domain/repositoryQueries';
import { nextPinnedRelativePaths, removePinnedRelativePath, resolvePinnedRepositories } from './domain/pinnedRepositories';
import {
  createPinnedRepositoryHistoryImportPlan,
  mergePinnedRepositoryHistory,
  normalizePinnedRepositoryHistory,
  removePinnedRepositoryHistoryEntry,
  type PinnedRepositoryHistoryImportItem,
} from './domain/pinnedRepositoryHistory';
import { getRepositoryChangeFiles, type RepositoryChangeFile } from './domain/repositoryChangeFiles';
import { openRepositoryGitGraph } from './domain/gitGraph';
import { GIT_BLOB_DOCUMENT_SCHEME, GitBlobDocumentProvider } from './git/gitBlobDocumentProvider';
import type { GitRepositoryLike } from './git/localGitRepository';
import { toRepositoryRelativePath } from './git/localGitRepositoryPaths';
import { ChangedFilesProvider } from './views/changedFilesProvider';
import { ChangedRepositoriesProvider } from './views/changedRepositoriesProvider';
import { ChangeGroupTreeItem } from './views/changeGroupTreeItem';
import { FileChangeTreeItem } from './views/fileChangeTreeItem';
import { RepositorySelectionState } from './views/repositorySelectionState';
import { RepositoryTreeItem } from './views/repositoryTreeItem';

const PINNED_REPOSITORY_HISTORY_KEY = 'pinnedRepositoryHistory';

/**
 * 这里把工作区扫描器、TreeDataProvider 和命令统一装配起来，所有 Git 操作都走本地 CLI。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('SCM Repository Filter');
  await mergeCurrentPinnedRepositoriesIntoHistory(context);
  const selectionState = new RepositorySelectionState();
  const repositoriesProvider = new ChangedRepositoriesProvider({
    workspaceRoots: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
  }, selectionState, outputChannel);
  outputChannel.appendLine(
    `[activate] Workspace roots: ${vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).join(', ') || 'none'}`,
  );
  await repositoriesProvider.initialize();
  const filesProvider = new ChangedFilesProvider(selectionState);
  const gitBlobDocumentProvider = new GitBlobDocumentProvider();
  const gitBlobDocumentRegistration = vscode.workspace.registerTextDocumentContentProvider(
    GIT_BLOB_DOCUMENT_SCHEME,
    gitBlobDocumentProvider,
  );
  const repositoriesTreeView = vscode.window.createTreeView(
    'scmRepositoryFilter.changedRepositories',
    { treeDataProvider: repositoriesProvider },
  );
  const filesTreeView = vscode.window.createTreeView(
    'scmRepositoryFilter.changedFiles',
    { treeDataProvider: filesProvider },
  );

  const syncMessage = () => {
    repositoriesTreeView.message = repositoriesProvider.getMessage();
    filesTreeView.message = filesProvider.getMessage();
  };

  context.subscriptions.push(
    outputChannel,
    selectionState,
    repositoriesTreeView,
    filesTreeView,
    repositoriesProvider,
    filesProvider,
    gitBlobDocumentProvider,
    gitBlobDocumentRegistration,
    vscode.commands.registerCommand('scmRepositoryFilter.refresh', () => repositoriesProvider.refreshFromGitStatus()),
    vscode.commands.registerCommand('scmRepositoryFilter.pinRepository', async () => {
      await pinRepository(context, repositoriesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.manageRepositoryHistory', async () => {
      await managePinnedRepositoryHistory(context, repositoriesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.unpinRepository', async (target: unknown) => {
      await unpinRepository(target, repositoriesProvider);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.openChange', async (repository: GitRepositoryLike, file: RepositoryChangeFile) => {
      await openChange(repository, file, gitBlobDocumentProvider);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.selectRepository', (target: unknown) => {
      const repository = resolveRepositoryTarget(target);
      if (repository) {
        selectionState.select(repository);
      }
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.openGitGraph', async (target: unknown) => {
      const repository = resolveRepositoryTarget(target);
      if (!repository) {
        vscode.window.showErrorMessage('No Git repository was selected.');
        return;
      }
      await openRepositoryGitGraph(repository.rootUri, {
        executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      });
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.commitStaged', async (target: unknown) => {
      const repository = resolveRepositoryTarget(target);
      if (!repository) {
        vscode.window.showErrorMessage('No Git repository was selected.');
        return;
      }
      await commitStaged(repository, repositoriesProvider, filesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.pull', async (target: unknown) => {
      await runRemoteAction(target, 'pull', repositoriesProvider, filesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.push', async (target: unknown) => {
      await runRemoteAction(target, 'push', repositoriesProvider, filesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.switchBranch', async (target: unknown) => {
      await switchBranch(target, repositoriesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.stageChange', async (target: unknown) => {
      await runFileAction(target, 'stage', repositoriesProvider, filesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.unstageChange', async (target: unknown) => {
      await runFileAction(target, 'unstage', repositoriesProvider, filesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.discardChange', async (target: unknown) => {
      await runFileAction(target, 'discard', repositoriesProvider, filesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.stageAllChanges', async (target: unknown) => {
      await runGroupAction(target, 'stageAll', repositoriesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.unstageAllChanges', async (target: unknown) => {
      await runGroupAction(target, 'unstageAll', repositoriesProvider, outputChannel);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.openRepository', async (repository: { rootUri: vscode.Uri }) => {
      // 这里用 revealInExplorer，而不是切换整个工作区；第一版只负责聚焦仓库根目录。
      await vscode.commands.executeCommand('revealInExplorer', repository.rootUri);
    }),
    repositoriesProvider.onDidChangeTreeData(() => {
      // Git status 事件首先刷新仓库列表；文件视图只在选中仓库的变更集真正变化时才跟随重建，
      // 避免编辑其它仓库时反复重刷已渲染的文件列表拖慢切换。
      filesProvider.refreshForRepositoryData();
      syncMessage();
    }),
    filesProvider.onDidChangeTreeData(() => syncMessage()),
    selectionState.onDidChange(() => syncMessage()),
    // Git 扩展事件之外，工作区文件事件覆盖保存、创建、删除和重命名等本地变化。
    // 结构变化统一走防抖的后台扫描，避免每个文件事件都触发递归扫盘和全仓库 status。
    vscode.workspace.onDidSaveTextDocument((document) => repositoriesProvider.scheduleStatusRefreshForUri(document.uri)),
    vscode.workspace.onDidCreateFiles((event) => {
      repositoriesProvider.scheduleRepositoryScan();
      event.files.forEach((uri) => repositoriesProvider.scheduleStatusRefreshForUri(uri));
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      repositoriesProvider.scheduleRepositoryScan();
      event.files.forEach((uri) => repositoriesProvider.scheduleStatusRefreshForUri(uri));
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      repositoriesProvider.scheduleRepositoryScan();
      for (const file of event.files) {
        repositoriesProvider.scheduleStatusRefreshForUri(file.oldUri);
        repositoriesProvider.scheduleStatusRefreshForUri(file.newUri);
      }
    }),
  );

  syncMessage();
}

export function deactivate(): void {}

async function openChange(
  repository: GitRepositoryLike,
  file: RepositoryChangeFile,
  gitBlobDocumentProvider: GitBlobDocumentProvider,
): Promise<void> {
  const plan = getChangeOpenPlan(file);
  const title = `${getRepositoryDisplayName(repository.rootUri.fsPath, repository.name)}: ${file.label}`;

  if (plan.type === 'command') {
    const command = plan.command as vscode.Command;
    await vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
    return;
  }

  if (plan.type === 'diff' && plan.original && plan.modified) {
    await openCliDiff(repository, plan.original, plan.modified, title, gitBlobDocumentProvider);
    return;
  }

  if (plan.type === 'openFile') {
    await vscode.commands.executeCommand('vscode.open', plan.uri);
    return;
  }

  vscode.window.showWarningMessage(`Unable to open change for ${file.label}.`);
}

async function openCliDiff(
  repository: GitRepositoryLike,
  original: { uri: { fsPath: string }; ref?: string },
  modified: { uri: { fsPath: string }; ref?: string },
  title: string,
  gitBlobDocumentProvider: GitBlobDocumentProvider,
): Promise<void> {
  const [originalUri, modifiedUri] = await Promise.all([
    getCliDiffSideUri(repository, original, gitBlobDocumentProvider),
    getCliDiffSideUri(repository, modified, gitBlobDocumentProvider),
  ]);
  await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
}

async function getCliDiffSideUri(
  repository: GitRepositoryLike,
  side: { uri: { fsPath: string }; ref?: string },
  gitBlobDocumentProvider: GitBlobDocumentProvider,
): Promise<vscode.Uri> {
  if (side.ref === undefined) {
    return side.uri as vscode.Uri;
  }

  const relativePath = toRepositoryRelativePath(repository.rootUri.fsPath, side.uri.fsPath);
  const ref = getGitBlobRef(side.ref);
  if (!ref) {
    return side.uri as vscode.Uri;
  }

  // 历史版本和 index 内容通过虚拟文档提供，避免依赖 Git 扩展或创建可见的 untitled Tab。
  const content = await repository.readBlob(ref, relativePath);
  return gitBlobDocumentProvider.createDocument(content);
}

async function commitStaged(
  repository: GitRepositoryLike,
  provider: ChangedRepositoriesProvider,
  filesProvider: ChangedFilesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const displayName = getRepositoryDisplayName(repository.rootUri.fsPath, repository.name);
  if (!hasStagedChanges(repository)) {
    vscode.window.showInformationMessage(`No staged changes in ${displayName}.`);
    return;
  }

  const commitMessage = await vscode.window.showInputBox({
    prompt: `Commit staged changes in ${displayName}`,
    placeHolder: 'Commit message',
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : 'Commit message is required.',
  });
  if (commitMessage === undefined) {
    return;
  }

  await runRepositoryOperation(
    repository,
    'commit',
    provider,
    filesProvider,
    outputChannel,
    commitMessage.trim(),
  );
}

async function runRemoteAction(
  target: unknown,
  action: 'pull' | 'push',
  provider: ChangedRepositoriesProvider,
  filesProvider: ChangedFilesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const repository = resolveRepositoryTarget(target);
  if (!repository) {
    vscode.window.showErrorMessage('No Git repository was selected.');
    return;
  }

  await runRepositoryOperation(repository, action, provider, filesProvider, outputChannel);
}

async function switchBranch(
  target: unknown,
  provider: ChangedRepositoriesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const repository = resolveRepositoryTarget(target);
  if (!repository) {
    vscode.window.showErrorMessage('No Git repository was selected.');
    return;
  }

  let branches: string[];
  try {
    branches = await repository.listBranches();
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to list branches: ${String(error)}`);
    return;
  }
  if (branches.length === 0) {
    vscode.window.showInformationMessage('No branches found in this repository.');
    return;
  }
  // 高亮当前分支（不可选或仅标记当前），避免用户误以为要切到它。
  const items = branches.map((branch) => ({
    label: branch,
    description: branch === repository.currentBranch ? 'current branch' : undefined,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a branch to switch to',
    matchOnDescription: true,
  });
  if (!picked) {
    return;
  }
  const branchName = picked.label;
  if (branchName === repository.currentBranch) {
    vscode.window.showInformationMessage(`Already on branch ${branchName}.`);
    return;
  }

  const displayName = getRepositoryDisplayName(repository.rootUri.fsPath, repository.name);
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Switching ${displayName} to ${branchName}` },
      () => repository.switchBranch(branchName),
    );
    // 切换可能改变工作区文件集合，复用通用 status 刷新让两个 Tree View 同步。
    provider.scheduleStatusRefresh([repository]);
    vscode.window.showInformationMessage(`Switched ${displayName} to ${branchName}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[switchBranch] ${repository.rootUri.fsPath}: ${detail}`);
    // 有未提交改动等冲突时，直接透出 git 报错；不自动 stash。
    vscode.window.showErrorMessage(`Failed to switch ${displayName} to ${branchName}: ${detail}`);
  }
}

async function runRepositoryOperation(
  repository: GitRepositoryLike,
  action: RepositoryAction,
  provider: ChangedRepositoriesProvider,
  filesProvider: ChangedFilesProvider,
  outputChannel: vscode.OutputChannel,
  commitMessage?: string,
): Promise<void> {
  const displayName = getRepositoryDisplayName(repository.rootUri.fsPath, repository.name);
  const actionLabel = getActionLabel(action);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${actionLabel} ${displayName}`,
      },
      () => runRepositoryAction(repository, action, commitMessage),
    );
    if (needsFallbackRefresh(repository)) {
      provider.scheduleStatusRefresh([repository]);
    }
    vscode.window.showInformationMessage(`${actionLabel} completed for ${displayName}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[${action}] ${repository.rootUri.fsPath}: ${detail}`);
    vscode.window.showErrorMessage(`${actionLabel} failed for ${displayName}: ${detail}`);
  }
}

async function runFileAction(
  target: unknown,
  action: RepositoryFileAction,
  repositoriesProvider: ChangedRepositoriesProvider,
  filesProvider: ChangedFilesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const fileTarget = resolveFileTarget(target);
  if (!fileTarget) {
    vscode.window.showErrorMessage('No changed file was selected.');
    return;
  }

  const { repository, file } = fileTarget;
  const displayName = getRepositoryDisplayName(repository.rootUri.fsPath, repository.name);
  if (action === 'discard') {
    const confirmation = await vscode.window.showWarningMessage(
      `Discard changes to ${file.label}?`,
      { modal: true },
      'Discard',
    );
    if (confirmation !== 'Discard') {
      return;
    }
  }

  try {
    const run = () => runRepositoryFileAction(repository, file, action);
    if (shouldShowFileActionProgress(action)) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${getFileActionLabel(action)} ${file.label}`,
        },
        run,
      );
    } else {
      await run();
    }
    if (needsFallbackRefresh(repository)) {
      // 单纯重发 onDidChangeTreeData 读的是缓存 state，git add 后才重跑的 status 才更新 state；
      // 走防抖 status 刷新，让暂存/撤销/丢弃真正反映到两个 Tree View。
      repositoriesProvider.scheduleStatusRefresh([repository]);
    }
    if (shouldShowFileActionSuccess(action)) {
      vscode.window.showInformationMessage(`${getFileActionLabel(action)} completed for ${displayName}.`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[${action}] ${repository.rootUri.fsPath}/${file.label}: ${detail}`);
    vscode.window.showErrorMessage(`${getFileActionLabel(action)} failed for ${file.label}: ${detail}`);
  }
}

async function runGroupAction(
  target: unknown,
  action: RepositoryFilesAction,
  repositoriesProvider: ChangedRepositoriesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const groupTarget = resolveGroupTarget(target);
  if (!groupTarget) {
    vscode.window.showErrorMessage('No changed file group was selected.');
    return;
  }

  const { repository, group } = groupTarget;
  const files = action === 'stageAll'
    ? getRepositoryChangeFiles(repository).filter((file) => file.group === 'workingTree' || file.group === 'untracked')
    : group.files;
  if (files.length === 0) {
    return;
  }

  try {
    await runRepositoryFilesAction(repository, files, action);
    if (needsFallbackRefresh(repository)) {
      repositoriesProvider.scheduleStatusRefresh([repository]);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[${action}] ${repository.rootUri.fsPath}: ${detail}`);
    vscode.window.showErrorMessage(`${getFilesActionLabel(action)} failed: ${detail}`);
  }
}

function resolveRepositoryTarget(target: unknown): GitRepositoryLike | undefined {
  if (target instanceof RepositoryTreeItem) {
    return target.repository;
  }
  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as Partial<GitRepositoryLike>;
  return candidate.rootUri && typeof candidate.rootUri.fsPath === 'string'
    ? candidate as GitRepositoryLike
    : undefined;
}

function resolveFileTarget(target: unknown): { repository: GitRepositoryLike; file: RepositoryChangeFile } | undefined {
  if (target instanceof FileChangeTreeItem) {
    return { repository: target.repository, file: target.file };
  }
  return undefined;
}

function resolveGroupTarget(target: unknown): {
  repository: GitRepositoryLike;
  group: ChangeGroupTreeItem['group'];
} | undefined {
  if (target instanceof ChangeGroupTreeItem) {
    return { repository: target.repository, group: target.group };
  }
  return undefined;
}

function getActionLabel(action: RepositoryAction): string {
  switch (action) {
    case 'commit':
      return 'Commit staged changes';
    case 'pull':
      return 'Pull';
    case 'push':
      return 'Push';
  }
}

function getFileActionLabel(action: RepositoryFileAction): string {
  switch (action) {
    case 'stage':
      return 'Stage';
    case 'unstage':
      return 'Unstage';
    case 'discard':
      return 'Discard';
  }
}

function getFilesActionLabel(action: RepositoryFilesAction): string {
  return action === 'stageAll' ? 'Stage all changes' : 'Unstage all changes';
}

interface PinnedRepositoryHistoryQuickPickItem extends vscode.QuickPickItem {
  historyPath: string;
  importItem: PinnedRepositoryHistoryImportItem;
}

interface PinnedRepositoryHistoryImportResult {
  imported: number;
  alreadyPinned: number;
  notFound: number;
  cancelledAmbiguous: number;
}

/**
 * 历史属于用户级记忆，工作区固定项属于项目级配置。激活时只做单向合并，避免升级后旧项目配置无法复用。
 */
async function mergeCurrentPinnedRepositoriesIntoHistory(context: vscode.ExtensionContext): Promise<void> {
  const current = currentPinnedRelativePaths();
  const existing = context.globalState.get<unknown>(PINNED_REPOSITORY_HISTORY_KEY);
  const merged = mergePinnedRepositoryHistory(existing, current);
  if (sameStringList(normalizePinnedRepositoryHistory(existing), merged)) {
    return;
  }
  await context.globalState.update(PINNED_REPOSITORY_HISTORY_KEY, merged);
}

async function addPinnedRepositoryHistoryEntry(
  context: vscode.ExtensionContext,
  relativePath: string,
): Promise<void> {
  const existing = context.globalState.get<unknown>(PINNED_REPOSITORY_HISTORY_KEY);
  const merged = mergePinnedRepositoryHistory(existing, [relativePath]);
  if (sameStringList(normalizePinnedRepositoryHistory(existing), merged)) {
    return;
  }
  await context.globalState.update(PINNED_REPOSITORY_HISTORY_KEY, merged);
}

async function managePinnedRepositoryHistory(
  context: vscode.ExtensionContext,
  provider: ChangedRepositoriesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const history = normalizePinnedRepositoryHistory(
    context.globalState.get<unknown>(PINNED_REPOSITORY_HISTORY_KEY),
  );
  if (history.length === 0) {
    vscode.window.showInformationMessage('No repository history yet. Pin a repository to add it here.');
    return;
  }

  const repositoryRoots = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Finding repositories for history import',
    },
    () => provider.discoverAllRepositoryRoots(),
  );
  let plan = createPinnedRepositoryHistoryImportPlan(
    repositoryRoots,
    history,
    currentPinnedRelativePaths(),
  );
  const quickPick = vscode.window.createQuickPick<PinnedRepositoryHistoryQuickPickItem>();
  const importAllButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('add'),
    tooltip: 'Add all available history entries',
  };
  const deleteButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('trash'),
    tooltip: 'Delete from repository history',
  };
  quickPick.title = 'Repository History';
  quickPick.placeholder = 'Select repositories to add to this workspace';
  quickPick.canSelectMany = true;
  quickPick.matchOnDescription = true;
  quickPick.buttons = [importAllButton];

  const refreshItems = () => {
    quickPick.items = plan.map((item) => ({
      label: item.historyPath,
      description: getPinnedRepositoryHistoryItemDescription(item),
      detail: item.status === 'ambiguous' ? item.candidateRoots.join(' | ') : undefined,
      buttons: [deleteButton],
      historyPath: item.historyPath,
      importItem: item,
    }));
  };
  refreshItems();

  quickPick.onDidAccept(() => {
    void runPinnedRepositoryHistoryQuickPickAction(quickPick, outputChannel, async () => {
      const result = await importPinnedRepositoryHistoryItems(
        quickPick.selectedItems.map((item) => item.importItem),
        provider,
        outputChannel,
      );
      quickPick.hide();
      showPinnedRepositoryHistoryImportResult(result);
    });
  });
  quickPick.onDidTriggerButton((button) => {
    if (button !== importAllButton) {
      return;
    }
    void runPinnedRepositoryHistoryQuickPickAction(quickPick, outputChannel, async () => {
      const result = await importPinnedRepositoryHistoryItems(plan, provider, outputChannel);
      quickPick.hide();
      showPinnedRepositoryHistoryImportResult(result);
    });
  });
  quickPick.onDidTriggerItemButton((event) => {
    if (event.button !== deleteButton) {
      return;
    }
    const nextHistory = removePinnedRepositoryHistoryEntry(
      context.globalState.get<unknown>(PINNED_REPOSITORY_HISTORY_KEY),
      event.item.historyPath,
    );
    void runPinnedRepositoryHistoryQuickPickAction(quickPick, outputChannel, async () => {
      await context.globalState.update(PINNED_REPOSITORY_HISTORY_KEY, nextHistory);
      plan = plan.filter((item) => item.historyPath !== event.item.historyPath);
      refreshItems();
      outputChannel.appendLine(`[history] Deleted "${event.item.historyPath}" from global repository history.`);
    });
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

/** Quick Pick 事件不会等待 Promise；统一捕获写入失败，避免未处理 rejection 和静默丢数据。 */
async function runPinnedRepositoryHistoryQuickPickAction(
  quickPick: vscode.QuickPick<PinnedRepositoryHistoryQuickPickItem>,
  outputChannel: vscode.OutputChannel,
  action: () => Promise<void>,
): Promise<void> {
  quickPick.busy = true;
  quickPick.enabled = false;
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[history] Repository history operation failed: ${detail}`);
    vscode.window.showErrorMessage(`Repository history operation failed: ${detail}`);
  } finally {
    quickPick.busy = false;
    quickPick.enabled = true;
  }
}

function getPinnedRepositoryHistoryItemDescription(item: PinnedRepositoryHistoryImportItem): string {
  switch (item.status) {
    case 'pinned':
      return 'already added to this workspace';
    case 'matched':
      return 'available to add';
    case 'ambiguous':
      return 'choose a matching repository when adding';
    case 'notFound':
      return 'not found in this workspace';
  }
}

async function importPinnedRepositoryHistoryItems(
  selected: readonly PinnedRepositoryHistoryImportItem[],
  provider: ChangedRepositoriesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<PinnedRepositoryHistoryImportResult> {
  const current = currentPinnedRelativePaths();
  let next: readonly string[] = current;
  let imported = 0;
  let alreadyPinned = 0;
  let notFound = 0;
  let cancelledAmbiguous = 0;

  for (const item of selected) {
    if (item.status === 'pinned') {
      alreadyPinned += 1;
      continue;
    }
    if (item.status === 'notFound') {
      notFound += 1;
      continue;
    }
    const targetRoot = item.status === 'matched'
      ? item.candidateRoots[0]
      : await chooseAmbiguousRoot([{ candidateRoots: item.candidateRoots }], item.historyPath);
    if (!targetRoot) {
      cancelledAmbiguous += 1;
      continue;
    }
    const relativePath = provider.toWorkspaceRelative(targetRoot);
    const updated = nextPinnedRelativePaths(next, relativePath);
    if (updated.length === next.length) {
      alreadyPinned += 1;
      continue;
    }
    next = updated;
    imported += 1;
  }

  if (imported > 0) {
    await updatePinnedRelativePaths(next);
    outputChannel.appendLine(`[history] Imported ${imported} repository entries into the current workspace.`);
  }
  return { imported, alreadyPinned, notFound, cancelledAmbiguous };
}

function showPinnedRepositoryHistoryImportResult(result: PinnedRepositoryHistoryImportResult): void {
  const skipped = result.alreadyPinned + result.notFound + result.cancelledAmbiguous;
  if (result.imported === 0) {
    vscode.window.showInformationMessage(
      skipped > 0 ? `No repositories added. ${skipped} history entries were skipped.` : 'No repositories selected.',
    );
    return;
  }
  vscode.window.showInformationMessage(
    `Added ${result.imported} repositories from history.${skipped > 0 ? ` Skipped ${skipped}.` : ''}`,
  );
}

function sameStringList(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((entry, index) => entry === second[index]);
}

async function pinRepository(
  context: vscode.ExtensionContext,
  provider: ChangedRepositoriesProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const repositoryRoots = await provider.discoverRepositoryRoots();
  if (repositoryRoots.length === 0) {
    vscode.window.showErrorMessage('No Git repositories found in the workspace to pin.');
    return;
  }

  const input = await vscode.window.showInputBox({
    prompt: 'Enter a repository path suffix to pin',
    placeHolder: 'e.g. acme/address',
    ignoreFocusOut: true,
  });
  if (input === undefined) {
    return;
  }
  const pattern = input.trim();
  if (!pattern) {
    return;
  }

  const current = currentPinnedRelativePaths();
  let resolution = resolvePinnedRepositories(repositoryRoots, [pattern]);

  // 浅层候选未命中时（不是歧义、确实没匹配到），做一次全量递归扫描兜底，
  // 避免漏掉 native Source Control 之外、未被 shallow 扫描发现的嵌套仓库。
  if (resolution.matched.length === 0 && resolution.notFound.includes(pattern)) {
    const allRoots = await provider.discoverAllRepositoryRoots();
    const merged = [...new Set([...repositoryRoots, ...allRoots])].sort();
    resolution = resolvePinnedRepositories(merged, [pattern]);
  }

  const targetRoot = resolution.matched[0]
    ?? await chooseAmbiguousRoot(resolution.ambiguous, pattern);
  if (!targetRoot) {
    vscode.window.showErrorMessage(
      resolution.notFound.includes(pattern)
        ? `No repository matches "${pattern}". Check that the path is valid for this workspace.`
        : `Repository "${pattern}" is ambiguous. Refine the path to a single repository.`,
    );
    return;
  }

  const relativePath = provider.toWorkspaceRelative(targetRoot);
  const next = nextPinnedRelativePaths(current, relativePath);
  if (next.length === current.length) {
    outputChannel.appendLine(`[pin] "${relativePath}" is already pinned.`);
    return;
  }
  await updatePinnedRelativePaths(next);
  await addPinnedRepositoryHistoryEntry(context, relativePath);
  outputChannel.appendLine(`[pin] Pinned "${relativePath}".`);
}

async function unpinRepository(
  target: unknown,
  provider: ChangedRepositoriesProvider,
): Promise<void> {
  const repository = resolveRepositoryTarget(target);
  if (!repository) {
    vscode.window.showErrorMessage('No pinned repository was selected.');
    return;
  }
  if (!provider.isPinnedRoot(repository.rootUri.fsPath)) {
    vscode.window.showWarningMessage('This repository is not pinned; nothing was removed.');
    return;
  }
  const relativePath = provider.toWorkspaceRelative(repository.rootUri.fsPath);
  const current = currentPinnedRelativePaths();
  const next = removePinnedRelativePath(current, relativePath);
  if (next.length === current.length) {
    return;
  }
  await updatePinnedRelativePaths(next);
}

async function chooseAmbiguousRoot(
  ambiguous: readonly { candidateRoots: readonly string[] }[],
  pattern: string,
): Promise<string | undefined> {
  for (const entry of ambiguous) {
    const candidates = entry.candidateRoots
      .map((root) => ({ root, label: root }))
      .map((option) => ({
        label: option.root,
        root: option.root,
      }));
    const picked = await vscode.window.showQuickPick(candidates, {
      placeHolder: `Multiple repositories match "${pattern}". Pick one to pin.`,
    });
    return picked?.root;
  }
  return undefined;
}

function currentPinnedRelativePaths(): string[] {
  return vscode.workspace.getConfiguration('scmRepositoryFilter').get<string[]>('pinnedRepositories') ?? [];
}

async function updatePinnedRelativePaths(next: readonly string[]): Promise<void> {
  await vscode.workspace.getConfiguration('scmRepositoryFilter').update('pinnedRepositories', [...next], vscode.ConfigurationTarget.Workspace);
}
