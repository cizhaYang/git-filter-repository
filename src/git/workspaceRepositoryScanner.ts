import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface WorkspaceRepositoryScannerOptions {
  maxDepth?: number;
  excludedDirectoryNames?: readonly string[];
}

export interface WorkspaceRepositoryScannerFileSystem {
  readDirectory(directory: string): Promise<readonly { name: string; isDirectory: boolean }[]>;
  getPathType(target: string): Promise<'directory' | 'file' | 'missing'>;
}

interface ScannerLogger {
  appendLine(message: string): void;
}

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_EXCLUDED_DIRECTORIES = new Set(['.git', '.vscode', 'dist', 'node_modules', 'out']);

const nativeFileSystem: WorkspaceRepositoryScannerFileSystem = {
  async readDirectory(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  },
  async getPathType(target) {
    try {
      const stats = await fs.lstat(target);
      if (stats.isDirectory()) {
        return 'directory';
      }
      if (stats.isFile()) {
        return 'file';
      }
      return 'missing';
    } catch (error) {
      // 路径不存在是正常扫描结果；权限和 I/O 错误必须保留给扫描层记录，不能静默伪装成非仓库。
      if (isMissingPathError(error)) {
        return 'missing';
      }
      throw error;
    }
  },
};

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export class WorkspaceRepositoryScanner {
  private readonly fileSystem: WorkspaceRepositoryScannerFileSystem;
  private readonly logger?: ScannerLogger;

  constructor(options: {
    fileSystem?: WorkspaceRepositoryScannerFileSystem;
    logger?: ScannerLogger;
  } = {}) {
    this.fileSystem = options.fileSystem ?? nativeFileSystem;
    this.logger = options.logger;
  }

  async scan(
    workspaceRoots: readonly string[],
    options: WorkspaceRepositoryScannerOptions = {},
  ): Promise<string[]> {
    const maxDepth = Math.max(0, options.maxDepth ?? DEFAULT_MAX_DEPTH);
    const excludedDirectories = new Set([
      ...DEFAULT_EXCLUDED_DIRECTORIES,
      ...(options.excludedDirectoryNames ?? []),
    ]);
    const repositories = new Set<string>();

    for (const workspaceRoot of workspaceRoots) {
      const root = path.resolve(workspaceRoot);
      await this.visit(root, 0, maxDepth, excludedDirectories, repositories);
    }

    return [...repositories].sort();
  }

  /**
   * 大型多仓库工作区先只检查工作区根目录，避免完整递归扫描阻塞 Changed Repositories 首次渲染。
   */
  async scanWorkspaceRoots(workspaceRoots: readonly string[]): Promise<string[]> {
    const repositories = new Set<string>();
    for (const workspaceRoot of workspaceRoots) {
      const root = path.resolve(workspaceRoot);
      try {
        const gitMarker = await this.fileSystem.getPathType(path.join(root, '.git'));
        if (gitMarker === 'directory' || gitMarker === 'file') {
          repositories.add(path.normalize(root));
        }
      } catch (error) {
        // 多根工作区需要逐根降级，单个路径无权限不能阻断其余主工程仓库识别。
        this.logger?.appendLine(`[scan] Skipped workspace root ${root}: ${String(error)}`);
      }
    }
    return [...repositories].sort();
  }

  private async visit(
    directory: string,
    depth: number,
    maxDepth: number,
    excludedDirectories: ReadonlySet<string>,
    repositories: Set<string>,
  ): Promise<void> {
    let gitMarker: 'directory' | 'file' | 'missing';
    try {
      gitMarker = await this.fileSystem.getPathType(path.join(directory, '.git'));
    } catch (error) {
      this.logger?.appendLine(`[scan] Skipped ${directory}: ${String(error)}`);
      return;
    }
    if (gitMarker === 'directory' || gitMarker === 'file') {
      // 父仓库里可能嵌套多个独立仓库；记录当前目录后仍需继续向下扫描。
      repositories.add(path.normalize(directory));
    }

    if (depth >= maxDepth) {
      return;
    }

    let entries: readonly { name: string; isDirectory: boolean }[];
    try {
      entries = await this.fileSystem.readDirectory(directory);
    } catch (error) {
      this.logger?.appendLine(`[scan] Skipped ${directory}: ${String(error)}`);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory || excludedDirectories.has(entry.name)) {
        continue;
      }
      await this.visit(path.join(directory, entry.name), depth + 1, maxDepth, excludedDirectories, repositories);
    }
  }
}
