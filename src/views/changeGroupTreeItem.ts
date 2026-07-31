import * as vscode from 'vscode';
import type { RepositoryChangeGroup, RepositoryChangeGroupFiles } from '../domain/repositoryChangeFiles';
import type { GitRepositoryLike } from '../git/localGitRepository';

export class ChangeGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repository: GitRepositoryLike,
    public readonly group: RepositoryChangeGroupFiles,
  ) {
    super(getGroupLabel(group.group), vscode.TreeItemCollapsibleState.Expanded);

    this.description = `${group.files.length}`;
    this.contextValue = getGroupContextValue(group.group);
    this.iconPath = new vscode.ThemeIcon('source-control');
    this.tooltip = `${getGroupLabel(group.group)} (${group.files.length})`;
  }
}

function getGroupContextValue(group: RepositoryChangeGroup): string {
  switch (group) {
    case 'index':
      return 'changedGroupIndex';
    case 'workingTree':
      return 'changedGroupWorkingTree';
    case 'merge':
      return 'changedGroupMerge';
    case 'untracked':
      return 'changedGroupUntracked';
  }
}

export function getGroupLabel(group: RepositoryChangeGroup): string {
  switch (group) {
    case 'index':
      return 'Staged Changes';
    case 'workingTree':
      return 'Changes';
    case 'merge':
      return 'Merge Changes';
    case 'untracked':
      return 'Untracked Changes';
  }
}
