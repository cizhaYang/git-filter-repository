import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitCli, type GitUntrackedFilesMode } from './gitCli';
import type { ParsedGitChange } from './gitStatusParser';
import { toRepositoryRelativePath } from './localGitRepositoryPaths';

export interface LocalGitChange {
  uri: vscode.Uri;
  originalUri?: vscode.Uri;
  resourceUri?: vscode.Uri;
  renameUri?: vscode.Uri;
  status?: string;
  indexStatus?: string;
  workingTreeStatus?: string;
  command?: unknown;
}

export interface LocalGitState {
  indexChanges: LocalGitChange[];
  workingTreeChanges: LocalGitChange[];
  mergeChanges: LocalGitChange[];
  untrackedChanges: LocalGitChange[];
  /** 保留旧领域接口的可选事件字段；CLI 仓库由 Provider 自己管理刷新，不使用该事件。 */
  onDidChange?: vscode.Event<void>;
}

export interface GitRepositoryLike {
  name?: string;
  rootUri: vscode.Uri;
  state: LocalGitState;
  status(untrackedFiles?: GitUntrackedFilesMode): Promise<void>;
  commit(message: string, options?: { all?: boolean }): Promise<void>;
  pull(): Promise<void>;
  push(): Promise<void>;
  add(paths: string[]): Promise<void>;
  revert(paths: string[]): Promise<void>;
  clean(paths: string[]): Promise<void>;
  readBlob(ref: string, relativePath: string): Promise<string>;
}

export class LocalGitRepository implements GitRepositoryLike {
  readonly rootUri: vscode.Uri;
  readonly name: string;
  state: LocalGitState = createEmptyState();

  constructor(
    rootPath: string,
    private readonly gitCli: GitCli,
  ) {
    const normalizedRoot = path.resolve(rootPath);
    this.rootUri = vscode.Uri.file(normalizedRoot);
    this.name = path.basename(normalizedRoot) || normalizedRoot;
  }

  async status(untrackedFiles: GitUntrackedFilesMode = 'all'): Promise<void> {
    const parsed = await this.gitCli.readStatus(this.rootUri.fsPath, untrackedFiles);
    this.state = {
      indexChanges: parsed.indexChanges.map((change) => toLocalChange(this.rootUri, change)),
      workingTreeChanges: parsed.workingTreeChanges.map((change) => toLocalChange(this.rootUri, change)),
      mergeChanges: parsed.mergeChanges.map((change) => toLocalChange(this.rootUri, change)),
      untrackedChanges: parsed.untrackedChanges.map((change) => toLocalChange(this.rootUri, change)),
    };
  }

  async commit(message: string, _options?: { all?: boolean }): Promise<void> {
    // 领域层已经保证只在 index 非空时进入提交；CLI 不传 --all，避免误提交工作区修改。
    await this.gitCli.commit(this.rootUri.fsPath, message);
  }

  async pull(): Promise<void> {
    await this.gitCli.pull(this.rootUri.fsPath);
  }

  async push(): Promise<void> {
    await this.gitCli.push(this.rootUri.fsPath);
  }

  async add(paths: string[]): Promise<void> {
    await this.gitCli.add(this.rootUri.fsPath, this.toRelativePaths(paths));
  }

  async revert(paths: string[]): Promise<void> {
    await this.gitCli.unstage(this.rootUri.fsPath, this.toRelativePaths(paths));
  }

  async clean(paths: string[]): Promise<void> {
    const relativePaths = this.toRelativePaths(paths);
    const untrackedPaths = new Set(this.state.untrackedChanges.map((change) =>
      toRepositoryRelativePath(this.rootUri.fsPath, change.uri.fsPath)));
    const tracked = relativePaths.filter((filePath) => !untrackedPaths.has(filePath));
    const untracked = relativePaths.filter((filePath) => untrackedPaths.has(filePath));

    if (tracked.length > 0) {
      await this.gitCli.discard(this.rootUri.fsPath, tracked, false);
    }
    if (untracked.length > 0) {
      await this.gitCli.discard(this.rootUri.fsPath, untracked, true);
    }
  }

  readBlob(ref: string, relativePath: string): Promise<string> {
    return this.gitCli.readBlob(this.rootUri.fsPath, ref, relativePath);
  }

  private toRelativePaths(paths: readonly string[]): string[] {
    return paths.map((filePath) => toRepositoryRelativePath(this.rootUri.fsPath, filePath));
  }
}

function createEmptyState(): LocalGitState {
  return {
    indexChanges: [],
    workingTreeChanges: [],
    mergeChanges: [],
    untrackedChanges: [],
  };
}

function toLocalChange(rootUri: vscode.Uri, change: ParsedGitChange): LocalGitChange {
  const uri = vscode.Uri.file(path.resolve(rootUri.fsPath, change.path));
  return {
    uri,
    ...(change.originalPath ? { originalUri: vscode.Uri.file(path.resolve(rootUri.fsPath, change.originalPath)) } : {}),
    status: change.status,
    indexStatus: change.indexStatus,
    workingTreeStatus: change.workingTreeStatus,
  };
}
