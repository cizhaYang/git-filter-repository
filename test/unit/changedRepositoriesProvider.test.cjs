const assert = require('node:assert/strict');
const test = require('node:test');
const { getChangedRepositories, getRepositoryDisplayName } = require('../../dist/domain/repositoryQueries.js');

test('changedRepositoriesProvider', () => {
  const repos = [
    { name: 'clean', rootUri: { fsPath: '/repo/clean' }, state: { indexChanges: [], workingTreeChanges: [], mergeChanges: [] } },
    { name: 'dirty', rootUri: { fsPath: '/repo/dirty' }, state: { indexChanges: [{ uri: 'a' }], workingTreeChanges: [], mergeChanges: [] } },
  ];

  assert.deepEqual(getChangedRepositories(repos).map((repo) => repo.name), ['dirty']);
});

test('repository display name falls back to the repository directory', () => {
  assert.equal(getRepositoryDisplayName('/workspace/ordering'), 'ordering');
  assert.equal(getRepositoryDisplayName('/workspace/ordering', 'ordering-alias'), 'ordering-alias');
});
