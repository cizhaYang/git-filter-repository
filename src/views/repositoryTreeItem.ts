import * as path from 'node:path';
import * as vscode from 'vscode';
import { countRepositoryChanges, type RepositoryLikeState } from '../domain/repositoryState';
import type { GitRepositoryLike } from '../git/gitExtension';

export class RepositoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repository: GitRepositoryLike,
    private readonly workspaceFolder?: vscode.WorkspaceFolder,
  ) {
    super(path.basename(repository.rootUri.fsPath), vscode.TreeItemCollapsibleState.Collapsed);

    const changeCount = countRepositoryChanges(repository.state as RepositoryLikeState);
    this.description = workspaceFolder
      ? vscode.workspace.asRelativePath(repository.rootUri, false)
      : repository.rootUri.fsPath;
    this.tooltip = `${repository.rootUri.fsPath}\n${changeCount} changes`;
    this.contextValue = 'changedRepository';
    this.iconPath = new vscode.ThemeIcon('repo');
  }
}
