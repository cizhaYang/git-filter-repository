import * as vscode from 'vscode';
import { getRepositoryChangeGroups } from '../domain/repositoryChangeFiles';
import { FileChangeTreeItem } from './fileChangeTreeItem';
import { ChangeGroupTreeItem } from './changeGroupTreeItem';
import { RepositorySelectionState } from './repositorySelectionState';

export type ChangedFilesTreeItem = ChangeGroupTreeItem | FileChangeTreeItem;

export class ChangedFilesProvider implements vscode.TreeDataProvider<ChangedFilesTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ChangedFilesTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly selectionSubscription: { dispose(): void };

  constructor(private readonly selectionState: RepositorySelectionState) {
    this.selectionSubscription = selectionState.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getMessage(): string | undefined {
    const repository = this.selectionState.selectedRepository;
    if (!repository) {
      return 'Select a changed repository to view its files.';
    }
    return getRepositoryChangeGroups(repository).length === 0
      ? 'No changed files were found.'
      : undefined;
  }

  getTreeItem(element: ChangedFilesTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChangedFilesTreeItem): ChangedFilesTreeItem[] {
    if (element instanceof ChangeGroupTreeItem) {
      return element.group.files.map((file) => new FileChangeTreeItem(element.repository, file));
    }

    const repository = this.selectionState.selectedRepository;
    if (!repository) {
      return [];
    }

    return getRepositoryChangeGroups(repository, { includeEmpty: ['workingTree'] })
      .map((group) => new ChangeGroupTreeItem(repository, group));
  }

  dispose(): void {
    this.selectionSubscription.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
