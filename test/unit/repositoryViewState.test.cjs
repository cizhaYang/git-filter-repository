const assert = require('node:assert/strict');
const test = require('node:test');
const { getChangedRepositoriesMessage } = require('../../dist/domain/repositoryViewState.js');

test('repositoryViewState', () => {
  assert.equal(
    getChangedRepositoriesMessage({ workspaceAvailable: false, gitAvailable: true }, 0),
    'Open a workspace to scan Git repositories.',
  );
  assert.equal(
    getChangedRepositoriesMessage({ workspaceAvailable: true, gitAvailable: false }, 0),
    'Git CLI is unavailable. Install Git to view changed repositories.',
  );
  assert.equal(
    getChangedRepositoriesMessage({ workspaceAvailable: true, gitAvailable: true }, 0),
    'No changed repositories were found.',
  );
  assert.equal(getChangedRepositoriesMessage({ workspaceAvailable: true, gitAvailable: true }, 2), undefined);
});
