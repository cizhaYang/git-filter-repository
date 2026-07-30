import * as vscode from 'vscode';

export interface GitApiLike {
  repositories: readonly GitRepositoryLike[];
  onDidOpenRepository: vscode.Event<GitRepositoryLike>;
  onDidCloseRepository: vscode.Event<GitRepositoryLike>;
  onDidChangeState: vscode.Event<unknown>;
}

export interface GitRepositoryLike {
  name?: string;
  rootUri: vscode.Uri;
  state: {
    indexChanges: unknown[];
    workingTreeChanges: unknown[];
    mergeChanges: unknown[];
    untrackedChanges?: unknown[];
    onDidChange?: vscode.Event<void>;
  };
  commit(message: string, options?: { all?: boolean }): Promise<void>;
  pull(): Promise<void>;
  push(): Promise<void>;
  add(paths: string[]): Promise<void>;
  revert(paths: string[]): Promise<void>;
  clean(paths: string[]): Promise<void>;
  status?: () => Promise<void>;
}

/**
 * Git 扩展是这个插件的唯一仓库数据源；拿不到就让视图空着，而不是自己扫描磁盘。
 */
export async function getGitApi(): Promise<GitApiLike | undefined> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: number): GitApiLike }>('vscode.git');
  if (!extension) {
    return undefined;
  }

  const activated = extension.isActive ? extension.exports : await extension.activate();
  return activated.getAPI(1);
}
