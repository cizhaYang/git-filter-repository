/**
 * VS Code Git 扩展把仓库状态拆成三类变更；第一版只关心“有没有改动”和“改动总数”。
 */
export interface RepositoryLikeState {
  indexChanges: unknown[];
  workingTreeChanges: unknown[];
  mergeChanges: unknown[];
}

export function hasRepositoryChanges(state: RepositoryLikeState): boolean {
  return countRepositoryChanges(state) > 0;
}

/**
 * 这里不区分暂存、未暂存和冲突，第一版的过滤视图只需要知道仓库是否应该出现。
 */
export function countRepositoryChanges(state: RepositoryLikeState): number {
  return state.indexChanges.length + state.workingTreeChanges.length + state.mergeChanges.length;
}
