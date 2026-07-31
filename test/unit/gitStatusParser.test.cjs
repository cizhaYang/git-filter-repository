const assert = require('node:assert/strict');
const test = require('node:test');
const { parseGitStatus } = require('../../dist/git/gitStatusParser.js');

test('parser separates index, working tree, merge, and untracked changes', () => {
  const result = parseGitStatus('M  staged.ts\0 M working.ts\0?? new.ts\0UU conflict.ts\0');

  assert.deepEqual(result.indexChanges.map((change) => change.path), ['staged.ts']);
  assert.deepEqual(result.workingTreeChanges.map((change) => change.path), ['working.ts']);
  assert.deepEqual(result.untrackedChanges.map((change) => change.path), ['new.ts']);
  assert.deepEqual(result.mergeChanges.map((change) => change.path), ['conflict.ts']);
});

test('parser preserves rename source and destination paths', () => {
  const result = parseGitStatus('R  renamed.ts\0old.ts\0');

  assert.equal(result.indexChanges[0].path, 'renamed.ts');
  assert.equal(result.indexChanges[0].originalPath, 'old.ts');
  assert.equal(result.indexChanges[0].status, 'RENAMED');
});

test('parser keeps special characters in paths', () => {
  const result = parseGitStatus('?? file with spaces\0?? line\nbreak.ts\0');

  assert.deepEqual(result.untrackedChanges.map((change) => change.path), [
    'file with spaces',
    'line\nbreak.ts',
  ]);
});

test('parser returns an empty state for empty git output', () => {
  assert.deepEqual(parseGitStatus(''), {
    indexChanges: [],
    workingTreeChanges: [],
    mergeChanges: [],
    untrackedChanges: [],
  });
});
