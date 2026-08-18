import * as path from 'node:path';
import * as vscode from 'vscode';
import { countRepositoryChanges, type RepositoryLikeState } from '../domain/repositoryState';
import type { GitRepositoryLike } from '../git/localGitRepository';

export class RepositoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repository: GitRepositoryLike,
    private readonly workspaceFolder?: vscode.WorkspaceFolder,
    private readonly isPinned = false,
  ) {
    super(path.basename(repository.rootUri.fsPath), vscode.TreeItemCollapsibleState.None);

    const changeCount = countRepositoryChanges(repository.state as RepositoryLikeState);
    const relativePath = workspaceFolder
      ? vscode.workspace.asRelativePath(repository.rootUri, false)
      : repository.rootUri.fsPath;
    // 描述行：相对路径 · 当前分支（无分支如 detached HEAD 时回退纯路径）。
    const branch = repository.currentBranch;
    this.description = branch ? `${relativePath} · ${branch}` : relativePath;
    this.tooltip = `${repository.rootUri.fsPath}\n${branch ? `Branch: ${branch}\n` : ''}${changeCount} changes`;
    // 固定仓库用 pinned 图标区分「手动固定的常驻仓库」与「因有改动出现的仓库」；
    // contextValue 决定右键菜单（Unpin 只出现在固定条目上）。
    this.contextValue = isPinned ? 'pinnedRepository' : 'changedRepository';
    this.iconPath = new vscode.ThemeIcon(isPinned ? 'pinned' : 'repo');
    this.command = {
      command: 'scmRepositoryFilter.selectRepository',
      title: 'Select Repository',
      arguments: [repository],
    };
  }
}
