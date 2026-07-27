import * as path from 'node:path';
import type { GitRepositoryLike } from '../git/gitExtension';

export type RepositoryChangeGroup = 'index' | 'workingTree' | 'merge';

export interface GitChangeLike {
  uri?: { fsPath: string };
  resourceUri?: { fsPath: string };
  originalUri?: { fsPath: string };
  renameUri?: { fsPath: string };
  status?: number | string;
  command?: unknown;
}

export interface RepositoryChangeFile {
  group: RepositoryChangeGroup;
  label: string;
  change: GitChangeLike;
  command?: unknown;
}

/**
 * Git 扩展把文件改动拆在三组里；Tree 视图需要统一列表，且保留原始 change 以复用 Git diff command。
 */
export function getRepositoryChangeFiles(repository: GitRepositoryLike): RepositoryChangeFile[] {
  return [
    ...mapChanges(repository.state.indexChanges as GitChangeLike[], 'index', repository.rootUri.fsPath),
    ...mapChanges(repository.state.workingTreeChanges as GitChangeLike[], 'workingTree', repository.rootUri.fsPath),
    ...mapChanges(repository.state.mergeChanges as GitChangeLike[], 'merge', repository.rootUri.fsPath),
  ];
}

function mapChanges(
  changes: readonly GitChangeLike[],
  group: RepositoryChangeGroup,
  repositoryRootPath: string,
): RepositoryChangeFile[] {
  return changes.map((change) => {
    const uri = change.uri ?? change.resourceUri ?? change.renameUri ?? change.originalUri;
    const fsPath = uri?.fsPath ?? 'unknown';

    return {
      group,
      label: getDisplayPath(repositoryRootPath, fsPath),
      change,
      command: change.command,
    };
  });
}

function getDisplayPath(repositoryRootPath: string, fsPath: string): string {
  const relativePath = path.relative(repositoryRootPath, fsPath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : path.basename(fsPath);
}
