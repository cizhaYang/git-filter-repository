import * as path from 'node:path';

export function toRepositoryRelativePath(repositoryRoot: string, filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const root = path.resolve(repositoryRoot);
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Path is outside repository: ${filePath}`);
  }
  return relativePath || '.';
}
