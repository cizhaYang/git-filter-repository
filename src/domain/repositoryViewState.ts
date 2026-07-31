export interface RepositoryViewAvailability {
  workspaceAvailable: boolean;
  gitAvailable: boolean;
}

/** 视图文案区分工作区、Git CLI 和过滤结果，避免把环境错误误报成“没有改动”。 */
export function getChangedRepositoriesMessage(
  availability: RepositoryViewAvailability,
  changedRepositoryCount: number,
): string | undefined {
  if (!availability.workspaceAvailable) {
    return 'Open a workspace to scan Git repositories.';
  }
  if (!availability.gitAvailable) {
    return 'Git CLI is unavailable. Install Git to view changed repositories.';
  }

  return changedRepositoryCount === 0 ? 'No changed repositories were found.' : undefined;
}
