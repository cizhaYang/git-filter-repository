const assert = require('node:assert/strict');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const {
  hasStagedChanges,
  needsFallbackRefresh,
  refreshRepositoryStatuses,
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
  assert.equal(needsFallbackRefresh({
    state: { onDidChange: () => ({ dispose() {} }) },
  }), false);
});

test('refreshes every repository status before rebuilding the repository view', async () => {
  const calls = [];
  await refreshRepositoryStatuses([
    { status: async () => calls.push('first') },
    { status: async () => calls.push('second') },
    {},
  ]);
  assert.deepEqual(calls.sort(), ['first', 'second']);
});

test('limits concurrent repository status refreshes', async () => {
  let active = 0;
  let maxActive = 0;
  const repositories = Array.from({ length: 8 }, () => ({
    status: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active -= 1;
    },
  }));

  await refreshRepositoryStatuses(repositories);

  assert.equal(maxActive, 4);
});
