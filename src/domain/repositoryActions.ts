import type { GitRepositoryLike } from '../git/gitExtension';
import type { RepositoryChangeFile } from './repositoryChangeFiles';

export type RepositoryAction = 'commit' | 'pull' | 'push';
export type RepositoryFileAction = 'stage' | 'unstage' | 'discard';
export type RepositoryFilesAction = 'stageAll' | 'unstageAll';

/**
 * 暂存和取消暂存是文件列表中的高频操作，成功后列表刷新本身已经反馈结果；
 * 丢弃改动会删除工作区内容，因此仍保留成功提示帮助用户确认操作已完成。
 */
export function shouldShowFileActionSuccess(action: RepositoryFileAction): boolean {
  return action === 'discard';
}

/**
 * 文件暂存操作执行很快，Notification 进度本身会表现为底部弹窗；只有丢弃改动
 * 需要用户明确感知执行过程，因此保留它的进度提示。
 */
export function shouldShowFileActionProgress(action: RepositoryFileAction): boolean {
  return action === 'discard';
}

/**
 * 当前 VS Code Git API 会通过 onDidRunGitStatus 通知状态变化；没有该事件时才需要
 * 操作完成后的主动刷新，避免同一次 Git 操作重复重建两个 Tree View。
 */
export function needsFallbackRefresh(
  repository: Pick<GitRepositoryLike, 'onDidRunGitStatus'>,
): boolean {
  return !repository.onDidRunGitStatus;
}

/**
 * Commit 的边界是 Git index；未暂存改动不能因为执行提交而被自动纳入。
 */
export function hasStagedChanges(repository: Pick<GitRepositoryLike, 'state'>): boolean {
  return repository.state.indexChanges.length > 0;
}

/**
 * 统一封装仓库操作，让 UI 层只处理输入、进度和提示，不重复 Git 调用规则。
 */
export async function runRepositoryAction(
  repository: GitRepositoryLike,
  action: RepositoryAction,
  commitMessage?: string,
): Promise<void> {
  switch (action) {
    case 'commit':
      if (!hasStagedChanges(repository)) {
        throw new Error('No staged changes');
      }
      await repository.commit(commitMessage ?? '', { all: false });
      return;
    case 'pull':
      await repository.pull();
      return;
    case 'push':
      await repository.push();
      return;
  }
}

/**
 * 文件操作必须根据所在分组选择 Git API，避免把工作区文件误当成 staged 文件处理。
 */
export async function runRepositoryFileAction(
  repository: Pick<GitRepositoryLike, 'add' | 'revert' | 'clean'>,
  file: RepositoryChangeFile,
  action: RepositoryFileAction,
): Promise<void> {
  const paths = [getChangePath(file)];
  switch (action) {
    case 'stage':
      await repository.add(paths);
      return;
    case 'unstage':
      await repository.revert(paths);
      return;
    case 'discard':
      await repository.clean(paths);
      return;
  }
}

/**
 * 批量操作只调用一次 Git API，避免逐文件调用 add/revert 后触发多轮状态扫描。
 */
export async function runRepositoryFilesAction(
  repository: Pick<GitRepositoryLike, 'add' | 'revert'>,
  files: readonly RepositoryChangeFile[],
  action: RepositoryFilesAction,
): Promise<void> {
  const paths = files.map(getChangePath);
  switch (action) {
    case 'stageAll':
      await repository.add(paths);
      return;
    case 'unstageAll':
      await repository.revert(paths);
      return;
  }
}

function getChangePath(file: RepositoryChangeFile): string {
  const uri = file.change.uri ?? file.change.resourceUri ?? file.change.renameUri ?? file.change.originalUri;
  if (!uri) {
    throw new Error(`Unable to resolve file path for ${file.label}`);
  }
  return uri.fsPath;
}
