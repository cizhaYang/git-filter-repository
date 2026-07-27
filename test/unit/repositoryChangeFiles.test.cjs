const assert = require('node:assert/strict');
const test = require('node:test');
const { getRepositoryChangeFiles } = require('../../dist/domain/repositoryChangeFiles.js');

test('repositoryChangeFiles', () => {
  const repository = {
    name: 'ordering',
    rootUri: { fsPath: '/workspace/ordering' },
    state: {
      indexChanges: [{ uri: { fsPath: '/workspace/ordering/src/staged.ts' }, command: { command: 'git.openChange' } }],
      workingTreeChanges: [{ uri: { fsPath: '/workspace/ordering/src/working.ts' } }],
      mergeChanges: [{ uri: { fsPath: '/workspace/ordering/src/conflict.ts' } }],
    },
  };

  const files = getRepositoryChangeFiles(repository);

  assert.deepEqual(files.map((file) => [file.group, file.label]), [
    ['index', 'src/staged.ts'],
    ['workingTree', 'src/working.ts'],
    ['merge', 'src/conflict.ts'],
  ]);
  assert.equal(files[0].command.command, 'git.openChange');
});
