const assert = require('node:assert/strict');
const test = require('node:test');
const { getChangeOpenPlan, getGitBlobRef } = require('../../dist/domain/changeOpenPlan.js');

test('changeOpenPlan compares a working tree change with the index', () => {
  const modifiedUri = { fsPath: '/workspace/ordering/src/index.ts' };
  const plan = getChangeOpenPlan({
    group: 'workingTree',
    label: 'src/index.ts',
    change: { uri: modifiedUri },
  });

  assert.deepEqual(plan, {
    type: 'diff',
    original: { uri: modifiedUri, ref: '~' },
    modified: { uri: modifiedUri },
  });
});

test('changeOpenPlan compares an index change with HEAD and the index', () => {
  const modifiedUri = { fsPath: '/workspace/ordering/src/index.ts' };
  const plan = getChangeOpenPlan({
    group: 'index',
    label: 'src/index.ts',
    change: { uri: modifiedUri },
  });

  assert.deepEqual(plan, {
    type: 'diff',
    original: { uri: modifiedUri, ref: 'HEAD' },
    modified: { uri: modifiedUri, ref: '' },
  });
});

test('changeOpenPlan keeps native git command when available', () => {
  const command = { command: 'git.openChange', arguments: ['resource'] };
  assert.deepEqual(getChangeOpenPlan({
    group: 'workingTree',
    label: 'src/index.ts',
    change: { command },
    command,
  }), {
    type: 'command',
    command,
  });
});

test('changeOpenPlan opens an untracked file directly', () => {
  const uri = { fsPath: '/workspace/ordering/src/new.ts' };
  assert.deepEqual(getChangeOpenPlan({
    group: 'untracked',
    label: 'src/new.ts',
    change: { uri },
  }), {
    type: 'openFile',
    uri,
  });
});

test('cli diff maps Git extension refs to Git CLI blob refs', () => {
  assert.equal(getGitBlobRef('HEAD'), 'HEAD');
  assert.equal(getGitBlobRef(''), ':');
  assert.equal(getGitBlobRef('~'), ':');
  assert.equal(getGitBlobRef(undefined), undefined);
});
