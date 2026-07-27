import * as vscode from 'vscode';

/**
 * 先保留最小激活逻辑，后续任务会在这里挂载 Git API 和 TreeDataProvider。
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('scmRepositoryFilter.refresh', () => undefined),
    vscode.commands.registerCommand('scmRepositoryFilter.openRepository', () => undefined),
  );
}

export function deactivate(): void {}
