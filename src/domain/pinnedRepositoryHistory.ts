import {
  normalizePinnedPattern,
  resolvePinnedRepositories,
} from './pinnedRepositories';

export type PinnedRepositoryHistoryImportStatus = 'pinned' | 'matched' | 'ambiguous' | 'notFound';

export interface PinnedRepositoryHistoryImportItem {
  historyPath: string;
  status: PinnedRepositoryHistoryImportStatus;
  candidateRoots: readonly string[];
}

/**
 * 全局状态来自旧版本或扩展同步，运行时必须过滤非字符串值；稳定去重可避免历史列表随工作区切换不断膨胀。
 */
export function normalizePinnedRepositoryHistory(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const path = normalizePinnedPattern(entry);
    if (path) {
      normalized.add(path);
    }
  }
  return [...normalized];
}

/** 将当前工作区配置并入跨工作区历史，不修改任何输入数组。 */
export function mergePinnedRepositoryHistory(
  history: unknown,
  workspacePinnedPaths: unknown,
): string[] {
  return normalizePinnedRepositoryHistory([
    ...normalizePinnedRepositoryHistory(history),
    ...normalizePinnedRepositoryHistory(workspacePinnedPaths),
  ]);
}

/** 删除只作用于全局历史；当前工作区固定配置由调用方独立持有。 */
export function removePinnedRepositoryHistoryEntry(
  history: unknown,
  target: string,
): string[] {
  const normalizedTarget = normalizePinnedPattern(target);
  return normalizePinnedRepositoryHistory(history).filter((entry) => entry !== normalizedTarget);
}

/**
 * 按现有固定仓库后缀规则生成导入计划，UI 层据此标记状态并仅对歧义项发起人工消歧。
 */
export function createPinnedRepositoryHistoryImportPlan(
  repositoryRoots: readonly string[],
  history: unknown,
  currentPinnedPaths: unknown,
): PinnedRepositoryHistoryImportItem[] {
  const pinned = new Set(normalizePinnedRepositoryHistory(currentPinnedPaths));
  const pinnedRoots = new Set(
    resolvePinnedRepositories(repositoryRoots, [...pinned]).matched,
  );
  return normalizePinnedRepositoryHistory(history).map((historyPath) => {
    const resolution = resolvePinnedRepositories(repositoryRoots, [historyPath]);
    const matchedRoot = resolution.matched[0];
    if (pinned.has(historyPath) || (matchedRoot !== undefined && pinnedRoots.has(matchedRoot))) {
      return {
        historyPath,
        status: 'pinned',
        candidateRoots: matchedRoot ? [matchedRoot] : [],
      };
    }
    if (matchedRoot) {
      return {
        historyPath,
        status: 'matched',
        candidateRoots: [matchedRoot],
      };
    }
    const ambiguous = resolution.ambiguous[0];
    if (ambiguous) {
      return {
        historyPath,
        status: 'ambiguous',
        candidateRoots: [...ambiguous.candidateRoots],
      };
    }
    return {
      historyPath,
      status: 'notFound',
      candidateRoots: [],
    };
  });
}
