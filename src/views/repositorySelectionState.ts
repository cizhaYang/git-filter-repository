import type { GitRepositoryLike } from '../git/localGitRepository';

export type RepositorySelectionListener = (repository: GitRepositoryLike | undefined) => void;

export interface RepositorySelectionSubscription {
  dispose(): void;
}

/**
 * 两个树视图共享当前仓库，但不共享 TreeItem；这样选择仓库不会触发目录跳转。
 */
export class RepositorySelectionState {
  private selected: GitRepositoryLike | undefined;
  private readonly listeners = new Set<RepositorySelectionListener>();

  get selectedRepository(): GitRepositoryLike | undefined {
    return this.selected;
  }

  onDidChange(listener: RepositorySelectionListener): RepositorySelectionSubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  select(repository: GitRepositoryLike | undefined): void {
    const changed = getRepositoryKey(this.selected) !== getRepositoryKey(repository)
      || this.selected !== repository;
    this.selected = repository;
    if (changed) {
      this.notify();
    }
  }

  reconcile(repositories: readonly GitRepositoryLike[]): void {
    const currentKey = getRepositoryKey(this.selected);
    const next = repositories.find((repository) => getRepositoryKey(repository) === currentKey)
      ?? repositories[0];
    this.select(next);
  }

  dispose(): void {
    this.listeners.clear();
    this.selected = undefined;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.selected);
    }
  }
}

function getRepositoryKey(repository: GitRepositoryLike | undefined): string | undefined {
  return repository?.rootUri.fsPath;
}
