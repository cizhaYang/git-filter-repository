import * as vscode from 'vscode';
import { getRepositoryChangeFiles } from '../domain/repositoryChangeFiles';
import { getChangedRepositories } from '../domain/repositoryQueries';
import { getChangedRepositoriesMessage } from '../domain/repositoryViewState';
import type { GitApiLike, GitRepositoryLike } from '../git/gitExtension';
import { FileChangeTreeItem } from './fileChangeTreeItem';
import { RepositoryTreeItem } from './repositoryTreeItem';

export type ChangedRepositoriesTreeItem = RepositoryTreeItem | FileChangeTreeItem;

export class ChangedRepositoriesProvider implements vscode.TreeDataProvider<ChangedRepositoriesTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ChangedRepositoriesTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly repositorySubscriptions = new Map<string, vscode.Disposable[]>();

  constructor(
    private readonly gitApi: GitApiLike | undefined,
    private readonly logger?: Pick<vscode.OutputChannel, 'appendLine'>,
  ) {
    if (!gitApi) {
      return;
    }

    for (const repository of gitApi.repositories) {
      this.watchRepository(repository);
    }

    // Git 状态和仓库列表都可能变化；这里把“刷新视图”和“管理仓库级监听”合并到同一组回调里。
    this.subscriptions.push(
      gitApi.onDidOpenRepository((repository) => {
        this.watchRepository(repository);
        this.refresh();
      }),
      gitApi.onDidCloseRepository((repository) => {
        this.unwatchRepository(repository);
        this.refresh();
      }),
    );
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getMessage(): string | undefined {
    return getChangedRepositoriesMessage(
      Boolean(this.gitApi),
      this.gitApi ? getChangedRepositories(this.gitApi.repositories).length : 0,
    );
  }

  getTreeItem(element: ChangedRepositoriesTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChangedRepositoriesTreeItem): ChangedRepositoriesTreeItem[] {
    if (element instanceof RepositoryTreeItem) {
      return getRepositoryChangeFiles(element.repository).map((file) => new FileChangeTreeItem(element.repository, file));
    }

    if (!this.gitApi) {
      return [];
    }

    const items: RepositoryTreeItem[] = [];

    for (const repository of getChangedRepositories(this.gitApi.repositories)) {
      try {
        items.push(new RepositoryTreeItem(
          repository,
          vscode.workspace.getWorkspaceFolder(repository.rootUri) ?? undefined,
        ));
      } catch (error) {
        this.logger?.appendLine(`Skipped repository ${repository.rootUri.fsPath}: ${String(error)}`);
      }
    }

    return items;
  }

  private watchRepository(repository: GitRepositoryLike): void {
    const key = repository.rootUri.toString();
    if (this.repositorySubscriptions.has(key)) {
      return;
    }

    const subscriptions: vscode.Disposable[] = [];

    // Git 扩展在一次 status 扫描结束后才会把 working tree / index 状态刷新到仓库对象上。
    // 这里监听仓库级 status 事件，而不是只依赖扩展级状态变化，避免文件保存后视图不刷新。
    if (repository.onDidRunGitStatus) {
      subscriptions.push(repository.onDidRunGitStatus(() => this.refresh()));
    }

    this.repositorySubscriptions.set(key, subscriptions);
    this.subscriptions.push(...subscriptions);
  }

  private unwatchRepository(repository: GitRepositoryLike): void {
    const key = repository.rootUri.toString();
    const subscriptions = this.repositorySubscriptions.get(key);
    if (!subscriptions) {
      return;
    }

    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    this.repositorySubscriptions.delete(key);
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
    this.repositorySubscriptions.clear();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}
