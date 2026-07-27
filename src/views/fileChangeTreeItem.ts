import * as vscode from 'vscode';
import type { RepositoryChangeFile } from '../domain/repositoryChangeFiles';
import type { GitRepositoryLike } from '../git/gitExtension';

export class FileChangeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repository: GitRepositoryLike,
    public readonly file: RepositoryChangeFile,
  ) {
    super(file.label, vscode.TreeItemCollapsibleState.None);

    this.description = getGroupDescription(file.group);
    this.tooltip = getFileTooltip(file);
    this.contextValue = getFileContextValue(file.group);
    this.iconPath = new vscode.ThemeIcon(getFileIcon(file.group));
    this.command = {
      command: 'scmRepositoryFilter.openChange',
      title: 'Open Change',
      arguments: [repository, file],
    };
  }
}

function getGroupDescription(group: RepositoryChangeFile['group']): string {
  switch (group) {
    case 'index':
      return 'staged';
    case 'merge':
      return 'conflict';
    case 'workingTree':
      return 'working tree';
    case 'untracked':
      return 'untracked';
  }
}

function getFileIcon(group: RepositoryChangeFile['group']): string {
  return group === 'merge' ? 'warning' : 'diff';
}

function getFileContextValue(group: RepositoryChangeFile['group']): string {
  switch (group) {
    case 'index':
      return 'changedFileIndex';
    case 'workingTree':
      return 'changedFileWorkingTree';
    case 'merge':
      return 'changedFileMerge';
    case 'untracked':
      return 'changedFileUntracked';
  }
}

function getFileTooltip(file: RepositoryChangeFile): string {
  const uri = file.change.uri ?? file.change.resourceUri ?? file.change.renameUri ?? file.change.originalUri;
  return uri?.fsPath ?? file.label;
}
