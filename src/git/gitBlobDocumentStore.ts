/**
 * 为历史/index 内容分配不透明 ID，避免把文件内容编码进 URI，也避免创建可见的 untitled 文档。
 */
export class GitBlobDocumentStore {
  private readonly contents = new Map<string, string>();
  private nextId = 0;

  create(content: string): string {
    const id = `blob-${this.nextId++}`;
    this.contents.set(id, content);
    return id;
  }

  read(id: string): string | undefined {
    return this.contents.get(id);
  }

  clear(): void {
    this.contents.clear();
  }
}
