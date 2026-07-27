import type { RepositoryChangeFile } from './repositoryChangeFiles';

export interface UriLike {
  fsPath: string;
}

export interface ChangeDiffSide {
  uri: UriLike;
  /** 空字符串表示 Git index；未提供 ref 表示工作区文件。 */
  ref?: string;
}

export type ChangeOpenPlan =
  | { type: 'command'; command: unknown }
  | { type: 'diff'; original?: ChangeDiffSide; modified?: ChangeDiffSide }
  | { type: 'openFile'; uri: UriLike }
  | { type: 'unavailable' };

const GIT_STATUS = {
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  INDEX_COPIED: 4,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
  IGNORED: 8,
  INTENT_TO_ADD: 9,
  INTENT_TO_RENAME: 10,
  TYPE_CHANGED: 11,
} as const;

/**
 * 决定文件节点点击后的打开方式。Git change 自带 command 时优先复用，否则才构造 diff fallback。
 */
export function getChangeOpenPlan(file: RepositoryChangeFile): ChangeOpenPlan {
  if (file.command) {
    return { type: 'command', command: file.command };
  }

  const modifiedUri = file.change.uri ?? file.change.resourceUri;
  const originalUri = file.change.originalUri ?? file.change.renameUri;

  if (!modifiedUri && !originalUri) {
    return { type: 'unavailable' };
  }

  if (file.group === 'index' && modifiedUri) {
    // 暂存区的右侧不能使用工作区文件，否则未暂存内容会混入暂存 diff。
    return {
      type: 'diff',
      original: { uri: originalUri ?? modifiedUri, ref: 'HEAD' },
      modified: { uri: modifiedUri, ref: '' },
    };
  }

  if (file.group === 'workingTree' && modifiedUri) {
    // 工作区改动要和 index 比较；Git 扩展用 ~ 表示这个左侧版本。
    if (isFileOnlyChange(file.change.status)) {
      return { type: 'openFile', uri: modifiedUri };
    }

    return {
      type: 'diff',
      original: { uri: originalUri ?? modifiedUri, ref: '~' },
      modified: { uri: modifiedUri },
    };
  }

  if (originalUri && modifiedUri) {
    return {
      type: 'diff',
      original: { uri: originalUri },
      modified: { uri: modifiedUri },
    };
  }

  if (modifiedUri) {
    return { type: 'openFile', uri: modifiedUri };
  }

  return { type: 'openFile', uri: originalUri as UriLike };
}

function isFileOnlyChange(status: number | string | undefined): boolean {
  return status === GIT_STATUS.UNTRACKED
    || status === GIT_STATUS.IGNORED
    || status === GIT_STATUS.INTENT_TO_ADD
    || status === 'UNTRACKED'
    || status === 'IGNORED'
    || status === 'INTENT_TO_ADD';
}
