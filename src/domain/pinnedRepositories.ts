import * as path from 'node:path';
import { hasRepositoryChanges, type RepositoryLikeState } from './repositoryState';

/**
 * 固定仓库（pinned repositories）的纯逻辑：把配置里的匹配模式解析成具体的仓库根目录，
 * 并把「改动仓库 ∪ 固定仓库」合并为可视列表。不依赖 vscode、无副作用，可直接单测。
 */

export interface PinnedRepositoryResolution {
  /** 模式唯一命中的仓库根目录（path.normalize 后的绝对路径） */
  matched: readonly string[];
  /** 一个模式命中多个仓库时的所有候选（调用方用 QuickPick 消歧） */
  ambiguous: readonly { pattern: string; candidateRoots: readonly string[] }[];
  /** 无法匹配任何仓库（或为空字符串）的模式 */
  notFound: readonly string[];
}

export interface RepositoryRootLike {
  rootUri: { fsPath: string };
}

/**
 * 把一个固定模式（如 `acme/address`）对仓库根目录做大小写敏感、以路径分隔符分段的
 * 后缀匹配。约定输入已去除首尾空白，且模式以 POSIX `/` 分隔（兼容 settings.json 的可移植写法）。
 */
export function normalizePinnedPattern(pattern: string): string {
  return pattern.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

export function escapePathSegment(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 对仓库根目录做后缀匹配：`acme/address` 命中 `.../originSource/acme/address`（整段起始边界
 * 在路径分隔符之后）。pattern 为空时永不命中。
 */
export function matchPinnedPattern(pattern: string, repositoryRoot: string): boolean {
  const normalizedPattern = normalizePinnedPattern(pattern);
  if (!normalizedPattern) {
    return false;
  }
  const root = path.normalize(repositoryRoot).replaceAll('\\', '/');
  const segments = normalizedPattern.split('/');
  const suffix = `/${segments.map(escapePathSegment).join('/')}`;
  return root.endsWith(suffix);
}

/**
 * 解析配置中的固定模式列表：返回匹配结果。空白模式会跳过且计入 notFound；重复模式只解析一次。
 */
export function resolvePinnedRepositories(
  repositoryRoots: readonly string[],
  patterns: readonly string[],
): PinnedRepositoryResolution {
  const seenPatterns = new Map<string, string | null>();

  const matched = new Set<string>();
  const ambiguous: { pattern: string; candidateRoots: readonly string[] }[] = [];
  const notFound: string[] = [];

  for (const rawPattern of patterns) {
    const normalizedPattern = normalizePinnedPattern(rawPattern);
    if (!normalizedPattern) {
      notFound.push(rawPattern);
      continue;
    }
    // 空白模式单独记 notFound；重复模式只处理一次。
    const seen = seenPatterns.get(normalizedPattern);
    if (seen !== undefined) {
      if (seen !== null) {
        matched.add(seen);
      }
      continue;
    }

    const hitRoots = repositoryRoots.filter((root) => matchPinnedPattern(normalizedPattern, root));
    if (hitRoots.length === 1) {
      matched.add(hitRoots[0] as string);
      seenPatterns.set(normalizedPattern, hitRoots[0] as string);
    } else if (hitRoots.length > 1) {
      ambiguous.push({ pattern: normalizedPattern, candidateRoots: hitRoots });
      seenPatterns.set(normalizedPattern, null);
    } else {
      notFound.push(rawPattern);
      seenPatterns.set(normalizedPattern, null);
    }
  }

  return {
    matched: [...matched],
    ambiguous,
    notFound,
  };
}

/**
 * 从全量仓库对象里筛出「有改动 ∪ 固定」的可见列表，并标注每个仓库是否固定。
 * 返回顺序稳定（保持传入顺序），固定标记供渲染 pin 图标用。仅返回 `repositories`
 * 中真实存在的项。
 */
export function mergeVisibleRepositories<T extends RepositoryRootLike & { state: RepositoryLikeState }>(
  repositories: readonly T[],
  isPinned: (repository: T) => boolean,
): { repository: T; isPinned: boolean }[] {
  const visible: { repository: T; isPinned: boolean }[] = [];
  for (const repository of repositories) {
    const pinned = isPinned(repository);
    if (!pinned && !hasRepositoryChanges(repository.state)) {
      continue;
    }
    visible.push({ repository, isPinned: pinned });
  }
  return visible;
}

/**
 * 把配置里存储的「相对工作区根的路径」（如 `originSource/acme/address`）解析为绝对根目录，
 * 不扫描文件系统。用于 pinned 模式：固定列表直接拼 workspaceRoot，避免每次刷新都全量扫描。
 *
 * 安全约束：拒绝解析到工作区根之外的条目（如 `../sibling`），防止配置被手动编辑或注入后
 * 让扩展把工作区外的目录当仓库固定。
 */
export function resolvePinnedRootsFromRelative(
  workspaceRoots: readonly string[],
  pinnedRelativePaths: readonly string[],
): string[] {
  if (workspaceRoots.length === 0) {
    return [];
  }
  const root = path.resolve(workspaceRoots[0] as string);
  const resolved = new Set<string>();
  for (const relativePath of pinnedRelativePaths) {
    const normalized = normalizePinnedPattern(relativePath);
    if (!normalized) {
      continue;
    }
    const absolute = path.resolve(root, ...normalized.split('/'));
    const normalizedAbsolute = path.normalize(absolute);
    const relativeToRoot = path.relative(root, normalizedAbsolute);
    // 越界防护：`..` 开头表示解析结果在工作区根之外，跳过该条目。
    if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`)) {
      continue;
    }
    resolved.add(normalizedAbsolute);
  }
  return [...resolved];
}

/**
 * pin 命令持久化决策（纯函数）：返回添加后的固定列表。
 * - 已固定同一路径 → 返回原列表（避免重复 pin）。
 * - 空白路径 → 返回原列表。
 */
export function nextPinnedRelativePaths(
  current: readonly string[],
  target: string,
): readonly string[] {
  const normalized = normalizePinnedPattern(target);
  if (!normalized || current.some((entry) => normalizePinnedPattern(entry) === normalized)) {
    return current;
  }
  return [...current, normalized];
}

/**
 * unpin 命令持久化决策（纯函数）：返回移除后的固定列表。
 * - 目标不在列表 → 返回原列表（调用方据此提示"未固定，未移除"）。
 */
export function removePinnedRelativePath(
  current: readonly string[],
  target: string,
): readonly string[] {
  const normalized = normalizePinnedPattern(target);
  if (!normalized) {
    return current;
  }
  const next = current.filter((entry) => normalizePinnedPattern(entry) !== normalized);
  return next.length === current.length ? current : next;
}
