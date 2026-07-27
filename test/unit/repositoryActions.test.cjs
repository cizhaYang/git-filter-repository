const assert = require('node:assert/strict');
const test = require('node:test');
const {
  hasStagedChanges,
  needsFallbackRefresh,
  runRepositoryAction,
} = require('../../dist/domain/repositoryActions.js');

function repository(state = { indexChanges: [], workingTreeChanges: [], mergeChanges: [] }) {
  const calls = [];
  return {
    state,
    calls,
    commit: async (...args) => calls.push(['commit', ...args]),
    pull: async () => calls.push(['pull']),
    push: async () => calls.push(['push']),
  };
}

test('staged commit requires at least one index change', async () => {
  const clean = repository();
  assert.equal(hasStagedChanges(clean), false);
  await assert.rejects(() => runRepositoryAction(clean, 'commit', 'message'), /No staged changes/);
});

test('staged commit never asks Git to stage all files', async () => {
  const repo = repository({ indexChanges: [{}], workingTreeChanges: [{}], mergeChanges: [] });
  assert.equal(hasStagedChanges(repo), true);
  await runRepositoryAction(repo, 'commit', 'message');
  assert.deepEqual(repo.calls, [['commit', 'message', { all: false }]]);
});

test('pull and push call the matching repository API', async () => {
  const repo = repository();
  await runRepositoryAction(repo, 'pull');
  await runRepositoryAction(repo, 'push');
  assert.deepEqual(repo.calls, [['pull'], ['push']]);
});

test('uses a refresh fallback only when Git status events are unavailable', () => {
  assert.equal(needsFallbackRefresh({}), true);
  assert.equal(needsFallbackRefresh({ onDidRunGitStatus: () => ({ dispose() {} }) }), false);
});
