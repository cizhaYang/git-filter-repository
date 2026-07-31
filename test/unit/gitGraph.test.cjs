const assert = require('node:assert/strict');
const test = require('node:test');
const { openRepositoryGitGraph } = require('../../dist/domain/gitGraph.js');

test('opens Git Graph with the selected repository root', async () => {
  const calls = [];
  const host = {
    executeCommand: async (...args) => calls.push(args),
    showErrorMessage: async () => undefined,
  };
  const rootUri = { fsPath: '/workspace/repo' };

  const opened = await openRepositoryGitGraph(rootUri, host);

  assert.equal(opened, true);
  assert.deepEqual(calls, [['git-graph.view', { rootUri }]]);
});

test('reports an actionable error when Git Graph cannot be opened', async () => {
  const errors = [];
  const host = {
    executeCommand: async () => {
      throw new Error('command not found');
    },
    showErrorMessage: async (message) => errors.push(message),
  };

  const opened = await openRepositoryGitGraph({ fsPath: '/workspace/repo' }, host);

  assert.equal(opened, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Git Graph/);
});
