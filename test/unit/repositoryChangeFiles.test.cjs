const assert = require('node:assert/strict');
const test = require('node:test');
const { getRepositoryChangeFiles, getRepositoryChangeGroups } = require('../../dist/domain/repositoryChangeFiles.js');

test('repositoryChangeFiles', () => {
  const repository = {
    name: 'ordering',
    rootUri: { fsPath: '/workspace/ordering' },
    state: {
      indexChanges: [{ uri: { fsPath: '/workspace/ordering/src/staged.ts' }, command: { command: 'git.openChange' } }],
      workingTreeChanges: [{ uri: { fsPath: '/workspace/ordering/src/working.ts' } }],
      mergeChanges: [{ uri: { fsPath: '/workspace/ordering/src/conflict.ts' } }],
      untrackedChanges: [{ uri: { fsPath: '/workspace/ordering/src/untracked.ts' } }],
    },
  };

  const files = getRepositoryChangeFiles(repository);

  assert.deepEqual(files.map((file) => [file.group, file.label]), [
    ['index', 'src/staged.ts'],
    ['workingTree', 'src/working.ts'],
    ['merge', 'src/conflict.ts'],
    ['untracked', 'src/untracked.ts'],
  ]);
  assert.equal(files[0].command.command, 'git.openChange');

  assert.deepEqual(getRepositoryChangeGroups(repository).map((group) => [group.group, group.files.length]), [
    ['index', 1],
    ['workingTree', 1],
    ['merge', 1],
    ['untracked', 1],
  ]);
});

test('keeps an empty Changes group when requested', () => {
  const repository = {
    name: 'ordering',
    rootUri: { fsPath: '/workspace/ordering' },
    state: {
      indexChanges: [],
      workingTreeChanges: [],
      mergeChanges: [],
      untrackedChanges: [],
    },
  };

  assert.deepEqual(
    getRepositoryChangeGroups(repository, { includeEmpty: ['workingTree'] })
      .map((group) => [group.group, group.files.length]),
    [['workingTree', 0]],
  );
});
