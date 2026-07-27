/**
 * 视图文案只表达当前过滤结果，不掺杂仓库内容本身，避免 UI 层里散落硬编码分支。
 */
export function getChangedRepositoriesMessage(hasGitApi: boolean, changedRepositoryCount: number): string | undefined {
  if (!hasGitApi) {
    return 'Enable the built-in Git extension to view changed repositories.';
  }

  return changedRepositoryCount === 0 ? 'No changed repositories were found.' : undefined;
}
