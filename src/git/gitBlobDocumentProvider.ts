import * as vscode from 'vscode';
import { GitBlobDocumentStore } from './gitBlobDocumentStore';

export const GIT_BLOB_DOCUMENT_SCHEME = 'scm-repository-filter-git';

/**
 * 为 diff 左侧的 HEAD/index 内容提供只读虚拟文档，避免 openTextDocument({ content }) 产生额外 Tab。
 */
export class GitBlobDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly store = new GitBlobDocumentStore();

  createDocument(content: string): vscode.Uri {
    const id = this.store.create(content);
    return vscode.Uri.from({
      scheme: GIT_BLOB_DOCUMENT_SCHEME,
      path: `/${id}`,
    });
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const id = uri.path.replace(/^\/+/, '');
    return this.store.read(id) ?? '';
  }

  dispose(): void {
    this.store.clear();
  }
}
