const assert = require('node:assert/strict');
const test = require('node:test');
const { RepositorySelectionState } = require('../../dist/views/repositorySelectionState.js');

function repository(path) {
  return { rootUri: { fsPath: path } };
}

test('selection state selects the first repository and preserves a dirty selection', () => {
  const state = new RepositorySelectionState();
  const first = repository('/workspace/first');
  const second = repository('/workspace/second');
  const selected = [];
  state.onDidChange((value) => selected.push(value?.rootUri.fsPath));

  state.reconcile([first, second]);
  assert.equal(state.selectedRepository, first);
  state.select(second);
  state.reconcile([first, second]);
  assert.equal(state.selectedRepository, second);
  assert.deepEqual(selected, ['/workspace/first', '/workspace/second']);
});

test('selection state switches when the selected repository is no longer dirty', () => {
  const state = new RepositorySelectionState();
  const first = repository('/workspace/first');
  const second = repository('/workspace/second');

  state.reconcile([first, second]);
  state.select(second);
  state.reconcile([first]);

  assert.equal(state.selectedRepository, first);
});
