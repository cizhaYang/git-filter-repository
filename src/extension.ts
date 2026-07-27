import * as vscode from 'vscode';
import { getChangeOpenPlan, type ChangeDiffSide } from './domain/changeOpenPlan';
import { getRepositoryDisplayName } from './domain/repositoryQueries';
import type { RepositoryChangeFile } from './domain/repositoryChangeFiles';
import { getGitApi } from './git/gitExtension';
import type { GitRepositoryLike } from './git/gitExtension';
import { ChangedRepositoriesProvider } from './views/changedRepositoriesProvider';

/**
 * 这里把 Git API、TreeDataProvider 和命令统一装配起来，后续 Git 操作也继续挂在这里。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const gitApi = await getGitApi();
  const outputChannel = vscode.window.createOutputChannel('SCM Repository Filter');
  const provider = new ChangedRepositoriesProvider(gitApi, outputChannel);
  const treeView = vscode.window.createTreeView('scmRepositoryFilter.changedRepositories', { treeDataProvider: provider });

  const syncMessage = () => {
    treeView.message = provider.getMessage();
  };

  context.subscriptions.push(
    outputChannel,
    treeView,
    provider,
    vscode.commands.registerCommand('scmRepositoryFilter.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('scmRepositoryFilter.openChange', async (repository: GitRepositoryLike, file: RepositoryChangeFile) => {
      await openChange(repository, file);
    }),
    vscode.commands.registerCommand('scmRepositoryFilter.openRepository', async (repository: { rootUri: vscode.Uri }) => {
      // 这里用 revealInExplorer，而不是切换整个工作区；第一版只负责聚焦仓库根目录。
      await vscode.commands.executeCommand('revealInExplorer', repository.rootUri);
    }),
    provider.onDidChangeTreeData(() => syncMessage()),
  );

  syncMessage();
}

export function deactivate(): void {}

async function openChange(repository: GitRepositoryLike, file: RepositoryChangeFile): Promise<void> {
  const plan = getChangeOpenPlan(file);
  const title = `${getRepositoryDisplayName(repository.rootUri.fsPath, repository.name)}: ${file.label}`;

  if (plan.type === 'command') {
    const command = plan.command as vscode.Command;
    await vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
    return;
  }

  if (plan.type === 'diff' && plan.original && plan.modified) {
    await vscode.commands.executeCommand(
      'vscode.diff',
      toGitUri(plan.original),
      toGitUri(plan.modified),
      title,
    );
    return;
  }

  if (plan.type === 'openFile') {
    await vscode.commands.executeCommand('vscode.open', plan.uri);
    return;
  }

  vscode.window.showWarningMessage(`Unable to open change for ${file.label}.`);
}

function toGitUri(side: ChangeDiffSide): vscode.Uri {
  const uri = side.uri as vscode.Uri;
  if (side.ref === undefined) {
    return uri;
  }

  // 内置 Git 扩展的 text document provider 通过 path/ref 读取历史版本；
  // 空 ref 是 index，~ 是 index 的工作树对比基准，HEAD 是提交版本。
  return uri.with({
    scheme: 'git',
    query: JSON.stringify({ path: uri.fsPath, ref: side.ref }),
  });
}
