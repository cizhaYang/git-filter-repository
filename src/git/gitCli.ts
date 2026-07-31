import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGitStatus, type ParsedGitStatus } from './gitStatusParser';

export interface GitExecOptions {
  encoding: 'utf8';
  maxBuffer: number;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export type GitUntrackedFilesMode = 'all' | 'normal';

export type GitExecutor = (
  file: string,
  args: readonly string[],
  options: GitExecOptions,
) => Promise<GitExecResult>;

const nativeExecutor = promisify(execFile) as unknown as GitExecutor;

const EXEC_OPTIONS: GitExecOptions = {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
};

/**
 * Git CLI 的唯一调用入口；参数保持数组形态，避免仓库路径、文件名和提交信息被 shell 重新解释。
 */
export class GitCli {
  constructor(private readonly execute: GitExecutor = nativeExecutor) {}

  async readStatus(rootPath: string, untrackedFiles: GitUntrackedFilesMode = 'all'): Promise<ParsedGitStatus> {
    const result = await this.run(rootPath, [
      'status',
      '--porcelain=v1',
      '-z',
      `--untracked-files=${untrackedFiles}`,
    ]);
    return parseGitStatus(result.stdout);
  }

  async add(rootPath: string, paths: readonly string[]): Promise<void> {
    await this.run(rootPath, ['add', '--', ...paths]);
  }

  async unstage(rootPath: string, paths: readonly string[]): Promise<void> {
    await this.run(rootPath, ['restore', '--staged', '--', ...paths]);
  }

  async discard(rootPath: string, paths: readonly string[], untracked: boolean): Promise<void> {
    await this.run(rootPath, untracked
      ? ['clean', '-f', '--', ...paths]
      : ['restore', '--', ...paths]);
  }

  async commit(rootPath: string, message: string): Promise<void> {
    await this.run(rootPath, ['commit', '-m', message]);
  }

  async pull(rootPath: string): Promise<void> {
    await this.run(rootPath, ['pull']);
  }

  async push(rootPath: string): Promise<void> {
    await this.run(rootPath, ['push']);
  }

  async readBlob(rootPath: string, ref: string, relativePath: string): Promise<string> {
    // Git index 的对象名是 `:path`，不能按普通 ref 拼成 `::path`。
    const objectPath = ref === ':' ? `:${relativePath}` : `${ref}:${relativePath}`;
    const result = await this.run(rootPath, ['show', objectPath]);
    return result.stdout;
  }

  private run(rootPath: string, args: readonly string[]): Promise<GitExecResult> {
    return this.execute('git', ['-C', rootPath, ...args], EXEC_OPTIONS);
  }
}
