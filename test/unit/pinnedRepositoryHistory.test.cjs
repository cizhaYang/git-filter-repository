const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPinnedRepositoryHistoryImportPlan,
  mergePinnedRepositoryHistory,
  normalizePinnedRepositoryHistory,
  removePinnedRepositoryHistoryEntry,
} = require('../../dist/domain/pinnedRepositoryHistory.js');

const ROOTS = [
  '/workspace/originSource/acme/address',
  '/workspace/originSource/acme/stores',
  '/workspace/packages/ordering',
];

test('normalizePinnedRepositoryHistory filters invalid values and stably deduplicates paths', () => {
  assert.deepEqual(
    normalizePinnedRepositoryHistory([
      ' originSource/acme/address ',
      1,
      null,
      '',
      'originSource\\acme\\address',
      'packages/ordering/',
    ]),
    ['originSource/acme/address', 'packages/ordering'],
  );
  assert.deepEqual(normalizePinnedRepositoryHistory({ invalid: true }), []);
});

test('mergePinnedRepositoryHistory appends normalized workspace entries without duplicates', () => {
  assert.deepEqual(
    mergePinnedRepositoryHistory(
      ['originSource/acme/address'],
      [' originSource/acme/stores ', 'originSource/acme/address'],
    ),
    ['originSource/acme/address', 'originSource/acme/stores'],
  );
});

test('removePinnedRepositoryHistoryEntry only removes the matching global history entry', () => {
  assert.deepEqual(
    removePinnedRepositoryHistoryEntry(
      ['originSource/acme/address', 'originSource/acme/stores'],
      'originSource/acme/address',
    ),
    ['originSource/acme/stores'],
  );
});

test('createPinnedRepositoryHistoryImportPlan classifies pinned, matched and missing entries', () => {
  const plan = createPinnedRepositoryHistoryImportPlan(
    ROOTS,
    ['originSource/acme/address', 'acme/stores', 'missing/repository'],
    ['originSource/acme/address'],
  );

  assert.deepEqual(plan, [
    {
      historyPath: 'originSource/acme/address',
      status: 'pinned',
      candidateRoots: ['/workspace/originSource/acme/address'],
    },
    {
      historyPath: 'acme/stores',
      status: 'matched',
      candidateRoots: ['/workspace/originSource/acme/stores'],
    },
    {
      historyPath: 'missing/repository',
      status: 'notFound',
      candidateRoots: [],
    },
  ]);
});

test('createPinnedRepositoryHistoryImportPlan keeps all candidates for ambiguous suffixes', () => {
  const plan = createPinnedRepositoryHistoryImportPlan(
    ['/workspace/apps/address', '/workspace/packages/address'],
    ['address'],
    [],
  );

  assert.deepEqual(plan, [{
    historyPath: 'address',
    status: 'ambiguous',
    candidateRoots: ['/workspace/apps/address', '/workspace/packages/address'],
  }]);
});

test('createPinnedRepositoryHistoryImportPlan detects an already-pinned repository through its matched root', () => {
  const plan = createPinnedRepositoryHistoryImportPlan(
    ROOTS,
    ['acme/address'],
    ['originSource/acme/address'],
  );

  assert.deepEqual(plan, [{
    historyPath: 'acme/address',
    status: 'pinned',
    candidateRoots: ['/workspace/originSource/acme/address'],
  }]);
});
