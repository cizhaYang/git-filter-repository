import * as vscode from 'vscode';
import type { GitRepositoryLike } from '../git/gitExtension';

/**
 * Changed Files 不能直接嵌入输入框，因此用一个根节点作为提交入口；点击后由命令
 * 打开 VS Code 原生 message 输入框，保持 Tree View 不需要引入 Webview。
 */
export class CommitTreeItem extends vscode.TreeItem {
  constructor(public readonly repository: GitRepositoryLike) {
    super('Commit staged changes', vscode.TreeItemCollapsibleState.None);

    this.description = 'Enter message';
    this.contextValue = 'changedFilesCommit';
    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.tooltip = 'Commit staged changes';
    this.command = {
      command: 'scmRepositoryFilter.commitStaged',
      title: 'Commit staged changes',
      arguments: [repository],
    };
  }
}
