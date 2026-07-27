const assert = require('node:assert/strict');
const test = require('node:test');
const { countRepositoryChanges, hasRepositoryChanges } = require('../../dist/domain/repositoryState.js');

test('repositoryState', () => {
  assert.equal(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [], mergeChanges: [] }), false);
  assert.equal(hasRepositoryChanges({ indexChanges: [{}], workingTreeChanges: [], mergeChanges: [] }), true);
  assert.equal(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [{}], mergeChanges: [] }), true);
  assert.equal(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [], mergeChanges: [{}] }), true);
  assert.equal(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [], mergeChanges: [], untrackedChanges: [{}] }), true);
  assert.equal(
    countRepositoryChanges({
      indexChanges: [{}, {}],
      workingTreeChanges: [{}],
      mergeChanges: [{}, {}],
      untrackedChanges: [{}],
    }),
    6,
  );
});
