/**
 * VS Code Git 扩展把仓库状态拆成四类变更；untrackedChanges 对旧测试数据保持可选。
 */
export interface RepositoryLikeState {
  indexChanges: unknown[];
  workingTreeChanges: unknown[];
  mergeChanges: unknown[];
  untrackedChanges?: unknown[];
}

export function hasRepositoryChanges(state: RepositoryLikeState): boolean {
  return countRepositoryChanges(state) > 0;
}

/**
 * 过滤仓库时四类变更都算作 dirty，避免未跟踪文件被过滤掉。
 */
export function countRepositoryChanges(state: RepositoryLikeState): number {
  return state.indexChanges.length
    + state.workingTreeChanges.length
    + state.mergeChanges.length
    + (state.untrackedChanges?.length ?? 0);
}
