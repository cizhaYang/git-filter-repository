import * as path from 'node:path';
import { hasRepositoryChanges, type RepositoryLikeState } from './repositoryState';

export interface RepositoryLikeForFiltering {
  state: RepositoryLikeState;
}

/**
 * 过滤逻辑独立出来，方便单测不依赖 vscode 模块，也方便后续复用到更多视图。
 */
export function getChangedRepositories<T extends RepositoryLikeForFiltering>(repositories: readonly T[]): T[] {
  return repositories.filter((repository) => hasRepositoryChanges(repository.state));
}

/**
 * 内置 Git API 不保证仓库对象提供 name；统一从根目录生成稳定的显示名称。
 */
export function getRepositoryDisplayName(repositoryRootPath: string, repositoryName?: string): string {
  return repositoryName?.trim() || path.basename(repositoryRootPath) || repositoryRootPath;
}
