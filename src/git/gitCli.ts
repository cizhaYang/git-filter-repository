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

  /**
   * 推送前先探测当前分支是否已有上游：新分支（无 @{upstream}）且存在 origin 时
   * 自动 `push -u origin <branch>`，避免用户手动建上游；无上游也无 origin 时退回裸 push，
   * 由 git 自然报错提示。已是最上层分支时使用普通 push。
   */
  async push(rootPath: string): Promise<void> {
    const branch = await this.getCurrentBranch(rootPath);
    if (branch && !(await this.hasUpstream(rootPath, branch)) && (await this.hasRemote(rootPath, 'origin'))) {
      await this.run(rootPath, ['push', '-u', 'origin', branch]);
      return;
    }
    await this.run(rootPath, ['push']);
  }

  private async getCurrentBranch(rootPath: string): Promise<string | undefined> {
    try {
      const result = await this.run(rootPath, ['branch', '--show-current']);
      const branch = result.stdout.trim();
      return branch || undefined;
    } catch (error) {
      // detached HEAD 或命令行不可用时，探测失败不代表仓库损坏；退回裸 push，由 git 报错。
      this.warn(`[git] Unable to read current branch: ${String(error)}`);
      return undefined;
    }
  }

  private async hasUpstream(rootPath: string, branch: string): Promise<boolean> {
    try {
      await this.run(rootPath, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
      return true;
    } catch (error) {
      // 无上游是预期情形（新分支），不是异常；仅在确有其它失败时留痕便于排查。
      this.warn(`[git] No upstream for ${branch}: ${String(error)}`);
      return false;
    }
  }

  private async hasRemote(rootPath: string, remote: string): Promise<boolean> {
    try {
      await this.run(rootPath, ['remote', 'get-url', remote]);
      return true;
    } catch (error) {
      this.warn(`[git] Remote "${remote}" not found: ${String(error)}`);
      return false;
    }
  }

  private warn(message: string): void {
    // 语义前缀为统一检索；git 层不依赖 vscode，故用 console.warn 而非 OutputChannel。
    console.warn(message);
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
