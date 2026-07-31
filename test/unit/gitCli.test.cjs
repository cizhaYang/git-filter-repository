const assert = require('node:assert/strict');
const test = require('node:test');
const { GitCli } = require('../../dist/git/gitCli.js');

test('git cli runs status in the repository root and converts the output', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout: ' M src/index.ts\0', stderr: '' };
  });

  const state = await cli.readStatus('/workspace/repo');

  assert.equal(calls[0].file, 'git');
  assert.deepEqual(calls[0].args, [
    '-C',
    '/workspace/repo',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  assert.equal(calls[0].options.encoding, 'utf8');
  assert.equal(state.workingTreeChanges[0].path, 'src/index.ts');
});

test('git cli supports a fast status mode that does not enumerate every untracked file', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: '', stderr: '' };
  });

  await cli.readStatus('/workspace/repo', 'normal');

  assert.deepEqual(calls[0].args, [
    '-C',
    '/workspace/repo',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=normal',
  ]);
});

test('git cli passes file operation paths after the separator', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: '', stderr: '' };
  });

  await cli.add('/workspace/repo', ['a file.ts']);
  await cli.unstage('/workspace/repo', ['a file.ts']);
  await cli.discard('/workspace/repo', ['a file.ts'], false);
  await cli.discard('/workspace/repo', ['new file.ts'], true);
  await cli.commit('/workspace/repo', 'commit message');
  await cli.pull('/workspace/repo');
  await cli.push('/workspace/repo');

  assert.deepEqual(calls.map((call) => call.args), [
    ['-C', '/workspace/repo', 'add', '--', 'a file.ts'],
    ['-C', '/workspace/repo', 'restore', '--staged', '--', 'a file.ts'],
    ['-C', '/workspace/repo', 'restore', '--', 'a file.ts'],
    ['-C', '/workspace/repo', 'clean', '-f', '--', 'new file.ts'],
    ['-C', '/workspace/repo', 'commit', '-m', 'commit message'],
    ['-C', '/workspace/repo', 'pull'],
    ['-C', '/workspace/repo', 'push'],
  ]);
});

test('git cli reads a blob with a separate git argument', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: 'old contents', stderr: '' };
  });

  const contents = await cli.readBlob('/workspace/repo', 'HEAD', 'src/index.ts');
  await cli.readBlob('/workspace/repo', ':', 'src/index.ts');

  assert.equal(contents, 'old contents');
  assert.deepEqual(calls[0].args, ['-C', '/workspace/repo', 'show', 'HEAD:src/index.ts']);
  assert.deepEqual(calls[1].args, ['-C', '/workspace/repo', 'show', ':src/index.ts']);
});

test('git cli preserves command errors and stderr', async () => {
  const failure = Object.assign(new Error('command failed'), { stderr: 'not a git repository' });
  const cli = new GitCli(async () => {
    throw failure;
  });

  await assert.rejects(
    () => cli.readStatus('/workspace/repo'),
    (error) => error === failure && error.stderr === 'not a git repository',
  );
});
