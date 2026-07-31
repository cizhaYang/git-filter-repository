import * as vscode from 'vscode';
import type { GitRepositoryLike } from '../git/localGitRepository';

/**
 * Push 与提交入口保持同样的操作行形式，点击后直接调用现有远程仓库命令。
 */
export class PushTreeItem extends vscode.TreeItem {
  constructor(public readonly repository: GitRepositoryLike) {
    super('Push to remote', vscode.TreeItemCollapsibleState.None);

    this.description = 'Publish local commits';
    this.contextValue = 'changedFilesPush';
    this.iconPath = new vscode.ThemeIcon('cloud-upload');
    this.tooltip = 'Push local commits to the remote repository';
    this.command = {
      command: 'scmRepositoryFilter.push',
      title: 'Push to remote',
      arguments: [repository],
    };
  }
}
