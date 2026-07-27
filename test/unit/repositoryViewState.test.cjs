const assert = require('node:assert/strict');
const test = require('node:test');
const { getChangedRepositoriesMessage } = require('../../dist/domain/repositoryViewState.js');

test('repositoryViewState', () => {
  assert.equal(getChangedRepositoriesMessage(false, 0), 'Enable the built-in Git extension to view changed repositories.');
  assert.equal(getChangedRepositoriesMessage(true, 0), 'No changed repositories were found.');
  assert.equal(getChangedRepositoriesMessage(true, 2), undefined);
});
