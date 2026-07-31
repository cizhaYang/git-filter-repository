const assert = require('node:assert/strict');
const test = require('node:test');
const { toRepositoryRelativePath } = require('../../dist/git/localGitRepositoryPaths.js');

test('repository path conversion keeps relative paths and converts absolute paths', () => {
  assert.equal(toRepositoryRelativePath('/workspace/repo', 'src/index.ts'), 'src/index.ts');
  assert.equal(toRepositoryRelativePath('/workspace/repo', '/workspace/repo/src/index.ts'), 'src/index.ts');
});

test('repository path conversion rejects files outside the repository', () => {
  assert.throws(
    () => toRepositoryRelativePath('/workspace/repo', '/workspace/other/file.ts'),
    /outside repository/,
  );
});
