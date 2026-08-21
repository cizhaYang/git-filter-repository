const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WorkspaceRepositoryScanner } = require('../../dist/git/workspaceRepositoryScanner.js');

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scm-repository-filter-'));
  fs.mkdirSync(path.join(root, 'app', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', '.git'), 'gitdir: /tmp/tools-git');
  fs.mkdirSync(path.join(root, 'node_modules', 'ignored', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'deep', 'one', 'two', '.git'), { recursive: true });
  return root;
}

test('scanner finds git directories and git files below workspace roots', async (t) => {
  const root = createWorkspace();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scanner = new WorkspaceRepositoryScanner();
  const repositories = await scanner.scan([root]);

  assert.deepEqual(repositories, [
    path.join(root, 'app'),
    path.join(root, 'deep', 'one', 'two'),
    path.join(root, 'tools'),
  ]);
});

test('scanner skips excluded directories and stops at max depth', async (t) => {
  const root = createWorkspace();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scanner = new WorkspaceRepositoryScanner();
  const repositories = await scanner.scan([root], { maxDepth: 2 });

  assert.deepEqual(repositories, [
    path.join(root, 'app'),
    path.join(root, 'tools'),
  ]);
});

test('scanner deduplicates overlapping workspace roots', async (t) => {
  const root = createWorkspace();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scanner = new WorkspaceRepositoryScanner();
  const repositories = await scanner.scan([root, path.join(root, 'app')]);

  assert.deepEqual(repositories, [
    path.join(root, 'app'),
    path.join(root, 'deep', 'one', 'two'),
    path.join(root, 'tools'),
  ]);
});

test('scanner continues through a parent repository to find nested repositories', async (t) => {
  const root = createWorkspace();
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scanner = new WorkspaceRepositoryScanner();
  const repositories = await scanner.scan([root]);

  assert.deepEqual(repositories, [
    root,
    path.join(root, 'app'),
    path.join(root, 'deep', 'one', 'two'),
    path.join(root, 'tools'),
  ]);
});

test('scanner checks workspace root repositories without walking nested folders', async (t) => {
  const root = createWorkspace();
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scanner = new WorkspaceRepositoryScanner();
  const repositories = await scanner.scanWorkspaceRoots([root, path.join(root, 'app')]);

  assert.deepEqual(repositories, [
    root,
    path.join(root, 'app'),
  ]);
});

test('workspace root scanning accepts git files, skips missing markers, and deduplicates roots', async (t) => {
  const root = createWorkspace();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const scanner = new WorkspaceRepositoryScanner();
  const repositories = await scanner.scanWorkspaceRoots([
    path.join(root, 'tools'),
    path.join(root, 'tools'),
    path.join(root, 'node_modules'),
  ]);

  assert.deepEqual(repositories, [path.join(root, 'tools')]);
});

test('workspace root scanning logs one failed root and continues with remaining roots', async () => {
  const logs = [];
  const scanner = new WorkspaceRepositoryScanner({
    fileSystem: {
      async readDirectory() { return []; },
      async getPathType(target) {
        if (target === path.join('/workspace-a', '.git')) {
          throw new Error('permission denied');
        }
        return target === path.join('/workspace-b', '.git') ? 'directory' : 'missing';
      },
    },
    logger: { appendLine(message) { logs.push(message); } },
  });

  const repositories = await scanner.scanWorkspaceRoots(['/workspace-a', '/workspace-b']);

  assert.deepEqual(repositories, [path.normalize('/workspace-b')]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[scan\].*workspace-a.*permission denied/);
});

test('recursive scanning skips a directory whose git marker cannot be inspected', async () => {
  const logs = [];
  const scanner = new WorkspaceRepositoryScanner({
    fileSystem: {
      async readDirectory(directory) {
        return directory === path.normalize('/workspace')
          ? [{ name: 'blocked', isDirectory: true }, { name: 'repo', isDirectory: true }]
          : [];
      },
      async getPathType(target) {
        if (target === path.join('/workspace/blocked', '.git')) {
          throw new Error('permission denied');
        }
        return target === path.join('/workspace/repo', '.git') ? 'directory' : 'missing';
      },
    },
    logger: { appendLine(message) { logs.push(message); } },
  });

  const repositories = await scanner.scan(['/workspace']);

  assert.deepEqual(repositories, [path.normalize('/workspace/repo')]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[scan\].*blocked.*permission denied/);
});
