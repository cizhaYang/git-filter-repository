const assert = require('node:assert/strict');
const test = require('node:test');
const {
  runRepositoryFilesAction,
  runRepositoryFileAction,
  shouldShowFileActionProgress,
  shouldShowFileActionSuccess,
} = require('../../dist/domain/repositoryActions.js');

function repository() {
  const calls = [];
  return {
    calls,
    add: async (paths) => calls.push(['add', paths]),
    revert: async (paths) => calls.push(['revert', paths]),
    clean: async (paths) => calls.push(['clean', paths]),
  };
}

function file(group) {
  return {
    group,
    label: 'src/example.ts',
    change: { uri: { fsPath: '/workspace/repo/src/example.ts' } },
  };
}

function fileWithPath(group, fsPath) {
  return {
    group,
    label: fsPath,
    change: { uri: { fsPath } },
  };
}

test('stage adds working tree and untracked files', async () => {
  const repo = repository();
  await runRepositoryFileAction(repo, file('workingTree'), 'stage');
  await runRepositoryFileAction(repo, file('untracked'), 'stage');
  assert.deepEqual(repo.calls, [
    ['add', ['/workspace/repo/src/example.ts']],
    ['add', ['/workspace/repo/src/example.ts']],
  ]);
});

test('unstage reverts the selected staged file', async () => {
  const repo = repository();
  await runRepositoryFileAction(repo, file('index'), 'unstage');
  assert.deepEqual(repo.calls, [['revert', ['/workspace/repo/src/example.ts']]]);
});

test('discard cleans the selected working tree file', async () => {
  const repo = repository();
  await runRepositoryFileAction(repo, file('workingTree'), 'discard');
  assert.deepEqual(repo.calls, [['clean', ['/workspace/repo/src/example.ts']]]);
});

test('stage and unstage success notifications are quiet', () => {
  assert.equal(shouldShowFileActionSuccess('stage'), false);
  assert.equal(shouldShowFileActionSuccess('unstage'), false);
  assert.equal(shouldShowFileActionSuccess('discard'), true);
});

test('stage and unstage do not show notification progress', () => {
  assert.equal(shouldShowFileActionProgress('stage'), false);
  assert.equal(shouldShowFileActionProgress('unstage'), false);
  assert.equal(shouldShowFileActionProgress('discard'), true);
});

test('stage all sends working tree and untracked paths in one Git call', async () => {
  const repo = repository();
  await runRepositoryFilesAction(repo, [
    fileWithPath('workingTree', '/workspace/repo/src/working.ts'),
    fileWithPath('untracked', '/workspace/repo/src/new.ts'),
  ], 'stageAll');
  assert.deepEqual(repo.calls, [[
    'add',
    ['/workspace/repo/src/working.ts', '/workspace/repo/src/new.ts'],
  ]]);
});

test('unstage all sends staged paths in one Git call', async () => {
  const repo = repository();
  await runRepositoryFilesAction(repo, [
    fileWithPath('index', '/workspace/repo/src/one.ts'),
    fileWithPath('index', '/workspace/repo/src/two.ts'),
  ], 'unstageAll');
  assert.deepEqual(repo.calls, [[
    'revert',
    ['/workspace/repo/src/one.ts', '/workspace/repo/src/two.ts'],
  ]]);
});
