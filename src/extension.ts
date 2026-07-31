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

/**
 * 这里把工作区扫描器、TreeDataProvider 和命令统一装配起来，所有 Git 操作都走本地 CLI。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('SCM Repository Filter');
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
      // Git status 事件首先刷新仓库列表；文件视图必须跟随刷新，即使选中仓库引用没有变化。
      filesProvider.refresh();
      syncMessage();
    }),
    filesProvider.onDidChangeTreeData(() => syncMessage()),
    selectionState.onDidChange(() => syncMessage()),
    // Git 扩展事件之外，工作区文件事件覆盖保存、创建、删除和重命名等本地变化。
    vscode.workspace.onDidSaveTextDocument((document) => repositoriesProvider.scheduleStatusRefreshForUri(document.uri)),
    vscode.workspace.onDidCreateFiles((event) => {
      void repositoriesProvider.refreshRepositories();
      event.files.forEach((uri) => repositoriesProvider.scheduleStatusRefreshForUri(uri));
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      void repositoriesProvider.refreshRepositories();
      event.files.forEach((uri) => repositoriesProvider.scheduleStatusRefreshForUri(uri));
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      void repositoriesProvider.refreshRepositories();
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
      provider.refresh();
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
      repositoriesProvider.refresh();
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
      repositoriesProvider.refresh();
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
