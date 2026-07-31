export interface ParsedGitChange {
  path: string;
  originalPath?: string;
  status: string;
  indexStatus: string;
  workingTreeStatus: string;
}

export interface ParsedGitStatus {
  indexChanges: ParsedGitChange[];
  workingTreeChanges: ParsedGitChange[];
  mergeChanges: ParsedGitChange[];
  untrackedChanges: ParsedGitChange[];
}

/**
 * 解析 porcelain v1 的 NUL 输出；第一列属于 index，第二列属于 working tree，
 * 重命名记录紧随其后携带旧路径，不能用按行 split 处理特殊文件名。
 */
export function parseGitStatus(output: string): ParsedGitStatus {
  const result: ParsedGitStatus = {
    indexChanges: [],
    workingTreeChanges: [],
    mergeChanges: [],
    untrackedChanges: [],
  };
  const records = output.split('\0');

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) {
      continue;
    }

    const indexStatus = record[0];
    const workingTreeStatus = record[1];
    const path = record.slice(3);
    if (!indexStatus || !workingTreeStatus || !path) {
      continue;
    }

    let originalPath: string | undefined;
    if (indexStatus === 'R' || indexStatus === 'C' || workingTreeStatus === 'R' || workingTreeStatus === 'C') {
      originalPath = records[index + 1] || undefined;
      index += 1;
    }

    const change = {
      path,
      ...(originalPath ? { originalPath } : {}),
      status: getStatusLabel(indexStatus, workingTreeStatus),
      indexStatus,
      workingTreeStatus,
    };

    if (indexStatus === '?' && workingTreeStatus === '?') {
      result.untrackedChanges.push(change);
      continue;
    }

    if (isMergeConflict(indexStatus, workingTreeStatus)) {
      result.mergeChanges.push(change);
      continue;
    }

    if (indexStatus !== ' ') {
      result.indexChanges.push({ ...change });
    }
    if (workingTreeStatus !== ' ') {
      result.workingTreeChanges.push({ ...change });
    }
  }

  return result;
}

function isMergeConflict(indexStatus: string, workingTreeStatus: string): boolean {
  return indexStatus === 'U'
    || workingTreeStatus === 'U'
    || (indexStatus === 'D' && workingTreeStatus === 'D')
    || (indexStatus === 'A' && workingTreeStatus === 'A');
}

function getStatusLabel(indexStatus: string, workingTreeStatus: string): string {
  if (indexStatus === '?' && workingTreeStatus === '?') {
    return 'UNTRACKED';
  }
  if (isMergeConflict(indexStatus, workingTreeStatus)) {
    return 'CONFLICT';
  }

  const status = indexStatus !== ' ' ? indexStatus : workingTreeStatus;
  switch (status) {
    case 'A':
      return 'ADDED';
    case 'C':
      return 'COPIED';
    case 'D':
      return 'DELETED';
    case 'R':
      return 'RENAMED';
    case 'T':
      return 'TYPE_CHANGED';
    case 'M':
      return 'MODIFIED';
    default:
      return status || 'UNKNOWN';
  }
}
