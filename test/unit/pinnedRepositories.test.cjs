const assert = require('node:assert/strict');
const test = require('node:test');
const {
  matchPinnedPattern,
  normalizePinnedPattern,
  resolvePinnedRepositories,
  resolvePinnedRootsFromRelative,
  mergeVisibleRepositories,
  nextPinnedRelativePaths,
  removePinnedRelativePath,
} = require('../../dist/domain/pinnedRepositories.js');

const ROOTS = [
  '/workspace/originSource/acme/address',
  '/workspace/originSource/acme/stores',
  '/workspace/originSource/order/kitchen',
  '/workspace/payments',
];

function makeRepo(fsPath, changes = {}) {
  return {
    rootUri: { fsPath },
    state: {
      indexChanges: changes.index ?? [],
      workingTreeChanges: changes.workingTree ?? [],
      mergeChanges: [],
      ...(changes.untracked === undefined ? {} : { untrackedChanges: changes.untracked }),
    },
  };
}test('normalizePinnedPattern trims, flattens backslashes, strips leading/trailing slashes', () => {
  assert.equal(normalizePinnedPattern('  acme/address  '), 'acme/address');
  assert.equal(normalizePinnedPattern('acme\\address'), 'acme/address');
  assert.equal(normalizePinnedPattern('/acme/address/'), 'acme/address');
  assert.equal(normalizePinnedPattern('   '), '');
});

test('matchPinnedPattern matches whole path segments at a boundary', () => {
  assert.equal(matchPinnedPattern('acme/address', '/workspace/originSource/acme/address'), true);
  assert.equal(matchPinnedPattern('acme/address', '/workspace/acme/address'), true);
  // 段边界：afe/address 不能命中 acme/address
  assert.equal(matchPinnedPattern('afe/address', '/workspace/acme/address'), false);
  // 空模式永不命中
  assert.equal(matchPinnedPattern('', '/workspace/acme/address'), false);
});

test('resolvePinnedRepositories unique suffix match', () => {
  const result = resolvePinnedRepositories(ROOTS, ['acme/address']);
  assert.deepEqual(result.matched, ['/workspace/originSource/acme/address']);
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.notFound, []);
});

test('resolvePinnedRepositories multiple hits become ambiguous with all candidates', () => {
  const result = resolvePinnedRepositories(
    ['/a/origin/acme/address', '/b/origin/acme/address'],
    ['acme/address'],
  );
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.ambiguous, [
    { pattern: 'acme/address', candidateRoots: ['/a/origin/acme/address', '/b/origin/acme/address'] },
  ]);
});

test('resolvePinnedRepositories no hit is notFound, blank patterns are skipped and reported', () => {
  const result = resolvePinnedRepositories(ROOTS, ['does/not/exist', '  ', '']);
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.notFound, ['does/not/exist', '  ', '']);
});

test('resolvePinnedRepositories deduplicates repeated patterns', () => {
  const result = resolvePinnedRepositories(ROOTS, ['acme/address', 'acme/address']);
  assert.deepEqual(result.matched, ['/workspace/originSource/acme/address']);
});

test('mergeVisibleRepositories keeps changed repos and pinned clean repos, marks pinned', () => {
  const repos = [
    makeRepo('/w/pinned', { untracked: [{}] }), // 固定且有改动
    makeRepo('/w/pinnedClean'), // 固定但零改动
    makeRepo('/w/dirty', { workingTree: [{}] }), // 有改动但未固定
    makeRepo('/w/clean'), // 未固定零改动 → 排除
  ];
  const isPinned = (r) => r.rootUri.fsPath.startsWith('/w/pinned');
  const visible = mergeVisibleRepositories(repos, isPinned);
  assert.equal(visible.length, 3);
  assert.deepEqual(
    visible.map(({ repository }) => repository.rootUri.fsPath),
    ['/w/pinned', '/w/pinnedClean', '/w/dirty'],
  );
  assert.deepEqual(
    visible.map(({ isPinned: p }) => p),
    [true, true, false],
  );
});

test('mergeVisibleRepositories returns empty for no matches', () => {
  const repos = [makeRepo('/w/clean')];
  assert.equal(mergeVisibleRepositories(repos, () => false).length, 0);
});

test('resolvePinnedRootsFromRelative joins workspace root with relative paths', () => {
  assert.deepEqual(
    [...resolvePinnedRootsFromRelative(['/workspace'], ['originSource/acme/address', 'acme/stores'])].sort(),
    ['/workspace/acme/stores', '/workspace/originSource/acme/address'],
  );
});

test('resolvePinnedRootsFromRelative round-trips the add-command persisted relative path', () => {
  // add 命令把发现到的绝对根转成相对工作区根；解析回同一起点是验收标准之一。
  const absoluteRoot = '/workspace/originSource/acme/address';
  const relative = absoluteRoot.slice('/workspace'.length);
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], [relative]), [absoluteRoot]);
});

test('resolvePinnedRootsFromRelative skips blank entries', () => {
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], ['  ', '']), []);
});

test('resolvePinnedRootsFromRelative rejects paths escaping the workspace root', () => {
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], ['../sibling']), []);
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], ['../../etc/passwd']), []);
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], ['originSource/../../outside']), []);
});

test('resolvePinnedRootsFromRelative rejects backslash and mixed-separator traversal (Windows portability)', () => {
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], ['..\\..\\etc\\passwd']), []);
  assert.deepEqual(resolvePinnedRootsFromRelative(['/workspace'], ['originSource\\..\\..\\nope']), []);
});

test('resolvePinnedRootsFromRelative keeps valid entries alongside a dropped traversal entry', () => {
  assert.deepEqual(
    [...resolvePinnedRootsFromRelative(['/workspace'], ['originSource/acme/address', '../sibling', 'acme/stores'])].sort(),
    ['/workspace/acme/stores', '/workspace/originSource/acme/address'],
  );
});

test('resolvePinnedRootsFromRelative returns empty when no workspace root exists', () => {
  assert.deepEqual(resolvePinnedRootsFromRelative([], ['originSource/acme/address']), []);
});

test('nextPinnedRelativePaths appends a new pinned path and normalizes it', () => {
  assert.deepEqual(nextPinnedRelativePaths(['originSource/acme/address'], 'acme/stores'), [
    'originSource/acme/address',
    'acme/stores',
  ]);
});

test('nextPinnedRelativePaths no-ops on a duplicate and on blank input', () => {
  const current = ['originSource/acme/address'];
  assert.deepEqual(nextPinnedRelativePaths(current, 'originSource/acme/address'), current);
  assert.deepEqual(nextPinnedRelativePaths(current, '  '), current);
});

test('removePinnedRelativePath removes the matching entry', () => {
  assert.deepEqual(removePinnedRelativePath(['a', 'b'], 'b'), ['a']);
});

test('removePinnedRelativePath no-ops when target is not present', () => {
  const current = ['a', 'b'];
  assert.deepEqual(removePinnedRelativePath(current, 'z'), current);
});
