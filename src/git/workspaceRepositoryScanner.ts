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
    } catch {
      return 'missing';
    }
  },
};

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

  private async visit(
    directory: string,
    depth: number,
    maxDepth: number,
    excludedDirectories: ReadonlySet<string>,
    repositories: Set<string>,
  ): Promise<void> {
    const gitMarker = await this.fileSystem.getPathType(path.join(directory, '.git'));
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
