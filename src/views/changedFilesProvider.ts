import * as vscode from 'vscode';
import { getRepositoryChangeFiles, getRepositoryChangeGroups } from '../domain/repositoryChangeFiles';
import { FileChangeTreeItem } from './fileChangeTreeItem';
import { ChangeGroupTreeItem } from './changeGroupTreeItem';
import { RepositorySelectionState } from './repositorySelectionState';

export type ChangedFilesTreeItem = ChangeGroupTreeItem | FileChangeTreeItem;

export class ChangedFilesProvider implements vscode.TreeDataProvider<ChangedFilesTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ChangedFilesTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly selectionSubscription: { dispose(): void };
  private renderedSignature = '';

  constructor(private readonly selectionState: RepositorySelectionState) {
    this.selectionSubscription = selectionState.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.renderedSignature = this.getSelectionSignature();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  /**
   * 后台仓库刷新会频繁触发；只有当前选中仓库的变更集真正变化时才重建文件树，
   * 避免编辑其它仓库时把已渲染的文件列表反复重刷造成切换卡顿。
   */
  refreshForRepositoryData(): void {
    const nextSignature = this.getSelectionSignature();
    if (nextSignature === this.renderedSignature) {
      return;
    }
    this.renderedSignature = nextSignature;
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

    return [
      ...getRepositoryChangeGroups(repository, { includeEmpty: ['workingTree'] })
        .map((group) => new ChangeGroupTreeItem(repository, group)),
    ];
  }

  dispose(): void {
    this.selectionSubscription.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }

  /**
   * 只对选中仓库的文件路径和分组做签名；根目录相同但内容变化时也能命中重渲染。
   */
  private getSelectionSignature(): string {
    const repository = this.selectionState.selectedRepository;
    if (!repository) {
      return '';
    }
    return [
      repository.rootUri.fsPath,
      ...getRepositoryChangeFiles(repository).map((file) => `${file.group}:${file.label}`),
    ].join('|');
  }
}
