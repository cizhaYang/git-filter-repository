const assert = require('node:assert/strict');
const test = require('node:test');
const { GitBlobDocumentStore } = require('../../dist/git/gitBlobDocumentStore.js');

test('git blob document store keeps revision content behind an opaque document id', () => {
  const store = new GitBlobDocumentStore();

  const firstId = store.create('first revision');
  const secondId = store.create('second revision');

  assert.notEqual(firstId, secondId);
  assert.equal(store.read(firstId), 'first revision');
  assert.equal(store.read(secondId), 'second revision');
});

test('git blob document store does not expose content for an unknown document id', () => {
  const store = new GitBlobDocumentStore();

  assert.equal(store.read('missing'), undefined);
});
