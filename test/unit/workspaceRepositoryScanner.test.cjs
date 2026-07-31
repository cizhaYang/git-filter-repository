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
