export interface GitGraphCommandHost {
  executeCommand(command: string, ...args: unknown[]): Thenable<unknown>;
  showErrorMessage(message: string): Thenable<unknown>;
}

/**
 * Git Graph 通过 rootUri 定位目标仓库，不能只执行无参命令，否则多仓库工作区会落到错误仓库。
 * 调用失败通常表示第三方扩展未安装或被禁用，因此统一给出可操作的提示。
 */
export async function openRepositoryGitGraph(
  rootUri: unknown,
  host: GitGraphCommandHost,
): Promise<boolean> {
  try {
    await host.executeCommand('git-graph.view', { rootUri });
    return true;
  } catch {
    await host.showErrorMessage('Unable to open Git Graph. Install and enable the Git Graph extension first.');
    return false;
  }
}
