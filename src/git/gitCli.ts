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

export interface GitStashEntry {
  ref: string;
  description: string;
}

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

  /**
   * 只保存 Git 已跟踪文件的当前改动；不传 --include-untracked，保持 Git 默认 stash 语义。
   * message 作为独立 argv 传入，避免用户输入被 shell 重新解释。
   */
  async stash(rootPath: string, message: string): Promise<void> {
    await this.run(rootPath, ['stash', 'push', '-m', message]);
  }

  /**
   * 用 NUL 分隔 ref 与 subject，避免 stash 描述中的冒号、空格或非 ASCII 字符破坏解析。
   */
  async listStashes(rootPath: string): Promise<GitStashEntry[]> {
    const result = await this.run(rootPath, ['stash', 'list', '--format=%gd%x00%gs%x00']);
    return parseStashList(result.stdout);
  }

  async applyStash(rootPath: string, ref: string): Promise<void> {
    await this.run(rootPath, ['stash', 'apply', ref]);
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

  /**
   * 返回当前 HEAD 所在分支名；detached HEAD 或命令失败时返回 undefined（不抛错）。
   * 供 status 刷新与 push 上游探测复用；上层（LocalGitRepository.status）用它缓存当前分支。
   */
  async getCurrentBranch(rootPath: string): Promise<string | undefined> {
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

  /**
   * 列出仓库所有可用分支（本地 + 远端去重），供切换分支的 QuickPick 展示。
   * `--format=%(refname:short)` 输出每行一个分支简名；剔除 `origin/HEAD` 这类符号引用；
   * 以换行分隔后去重。返回值为分支名数组，不拼进任何后续 git 命令行（仅作 UI 数据）。
   */
  async listBranches(rootPath: string): Promise<string[]> {
    const result = await this.run(rootPath, ['branch', '--all', '--format=%(refname:short)']);
    const seen = new Set<string>();
    const branches: string[] = [];
    for (const rawLine of result.stdout.split('\n')) {
      const branch = rawLine.trim();
      // origin/HEAD 是指向默认分支的符号引用，不是真实分支，应剔除。
      if (!branch || branch.includes('HEAD') || seen.has(branch)) {
        continue;
      }
      seen.add(branch);
      branches.push(branch);
    }
    return branches;
  }

  /**
   * 切换分支。远端 ref（`origin/<name>`）直接用会进入 detached HEAD，因此自动创建同名本地追踪分支
   * （`checkout -b <name> <origin/<name>>`）；本地分支则普通 `checkout <branch>`。
   * 分支名作为 argv 数组元素传给 subprocess，避免 shell 重新解释。
   */
  async checkoutBranch(rootPath: string, ref: string): Promise<void> {
    if (ref.startsWith('origin/')) {
      const localName = ref.slice('origin/'.length);
      await this.run(rootPath, ['checkout', '-b', localName, ref]);
      return;
    }
    await this.run(rootPath, ['checkout', ref]);
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

function parseStashList(output: string): GitStashEntry[] {
  const fields = output.replace(/\r?\n/g, '').split('\0');
  if (fields.length === 1 && fields[0] === '') {
    return [];
  }

  const entries: GitStashEntry[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const ref = fields[index]?.trim() ?? '';
    // description 是用户可见的 subject；只去掉格式分隔产生的换行，保留其余原文。
    const description = fields[index + 1] ?? '';
    if (!ref && !description) {
      continue;
    }
    if (!ref || !description) {
      throw new Error('Invalid git stash list output.');
    }
    entries.push({ ref, description });
  }
  return entries;
}
