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
    // push 会先做上游探测；返回「已有 upstream」让 push 走普通路径，保持断言为裸 push。
    if (args.includes('branch') && args.includes('--show-current')) {
      return { stdout: 'feature/x\n', stderr: '' };
    }
    if (args.includes('@{upstream}')) {
      return { stdout: 'origin/feature/x\n', stderr: '' };
    }
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
    ['-C', '/workspace/repo', 'branch', '--show-current'],
    ['-C', '/workspace/repo', 'rev-parse', '--abbrev-ref', 'feature/x@{upstream}'],
    ['-C', '/workspace/repo', 'push'],
  ]);
});

test('git cli push adds upstream to the current branch when it has no upstream', async () => {
  const calls = [];
  let step = 0;
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    step += 1;
    // 查询序列：当前分支 -> upstream 检测（无 upstream，抛错）-> origin 存在性
    if (step === 1) {
      return { stdout: 'feature/x\n', stderr: '' };
    }
    if (step === 2) {
      throw Object.assign(new Error('no upstream'), { stderr: 'fatal: no upstream' });
    }
    if (step === 3) {
      return { stdout: 'git@example.com:org/repo.git\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  await cli.push('/workspace/repo');

  const pushCall = calls[3];
  assert.deepEqual(pushCall.args, ['-C', '/workspace/repo', 'push', '-u', 'origin', 'feature/x']);
});

test('git cli push uses a plain push when the branch already has an upstream', async () => {
  const calls = [];
  let step = 0;
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    step += 1;
    if (step === 1) {
      return { stdout: 'feature/x\n', stderr: '' };
    }
    if (step === 2) {
      return { stdout: 'origin/feature/x\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  await cli.push('/workspace/repo');

  assert.deepEqual(calls.map((call) => call.args), [
    ['-C', '/workspace/repo', 'branch', '--show-current'],
    ['-C', '/workspace/repo', 'rev-parse', '--abbrev-ref', 'feature/x@{upstream}'],
    ['-C', '/workspace/repo', 'push'],
  ]);
});

test('git cli push falls back to a plain push when there is no origin remote', async () => {
  const calls = [];
  let step = 0;
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    step += 1;
    if (step === 1) {
      return { stdout: 'feature/x\n', stderr: '' };
    }
    if (step === 2) {
      throw Object.assign(new Error('no upstream'), { stderr: 'fatal: no upstream' });
    }
    if (step === 3) {
      throw Object.assign(new Error('no origin'), { stderr: 'fatal: no origin remote' });
    }
    return { stdout: '', stderr: '' };
  });

  await cli.push('/workspace/repo');

  const pushCall = calls[3];
  assert.deepEqual(pushCall.args, ['-C', '/workspace/repo', 'push']);
});

test('git cli push uses a plain push when no branch is checked out', async () => {
  const calls = [];
  let step = 0;
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    step += 1;
    if (step === 1) {
      return { stdout: '', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  await cli.push('/workspace/repo');

  assert.deepEqual(calls[1].args, ['-C', '/workspace/repo', 'push']);
});

test('git cli push keeps branch names as single argv tokens without shell injection', async () => {
  const calls = [];
  let step = 0;
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    step += 1;
    if (step === 1) {
      return { stdout: 'feature/修复$ bug\n', stderr: '' };
    }
    if (step === 2) {
      throw Object.assign(new Error('no upstream'), { stderr: 'fatal: no upstream' });
    }
    if (step === 3) {
      return { stdout: 'git@example.com:org/repo.git\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  await cli.push('/workspace/repo');

  const pushCall = calls[3];
  assert.deepEqual(pushCall.args, [
    '-C',
    '/workspace/repo',
    'push',
    '-u',
    'origin',
    'feature/修复$ bug',
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

test('git cli getCurrentBranch returns the branch name and undefined for detached HEAD', async () => {
  let step = 0;
  const cli = new GitCli(async (file, args) => {
    step += 1;
    if (step === 1) {
      return { stdout: 'feature/x\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  });

  await cli.getCurrentBranch('/workspace/repo');
  const detached = await cli.getCurrentBranch('/workspace/repo');

  // 第一次调用使用 branch --show-current
  assert.equal(step, 2);
  assert.equal(detached, undefined);
});

test('git cli getCurrentBranch is public and reusable by status refresh', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: 'main\n', stderr: '' };
  });

  const branch = await cli.getCurrentBranch('/workspace/repo');

  assert.equal(branch, 'main');
  assert.deepEqual(calls[0].args, ['-C', '/workspace/repo', 'branch', '--show-current']);
});

test('git cli listBranches returns deduplicated local and remote branches', async () => {
  const output = [
    'main',
    'feature/x',
    'feature/修复$ bug',
    'origin/HEAD',
    'origin/develop',
    'origin/main',
    'origin/main',
    '',
  ].join('\n');
  const cli = new GitCli(async (file, args) => ({ stdout: output, stderr: '' }));

  const branches = await cli.listBranches('/workspace/repo');

  assert.deepEqual(branches, [
    'main',
    'feature/x',
    'feature/修复$ bug',
    'origin/develop',
    'origin/main',
  ]);
});

test('git cli listBranches excludes the symbolic HEAD reference', async () => {
  const cli = new GitCli(async () => ({ stdout: 'main\norigin/HEAD -> origin/main\norigin/main\n', stderr: '' }));

  const branches = await cli.listBranches('/workspace/repo');

  assert.deepEqual(branches, ['main', 'origin/main']);
});

test('git cli checkoutBranch passes local branch as single argv token', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: '', stderr: '' };
  });

  await cli.checkoutBranch('/workspace/repo', 'feature/x');

  assert.deepEqual(calls[0].args, ['-C', '/workspace/repo', 'checkout', 'feature/x']);
});

test('git cli checkoutBranch creates a local tracking branch for a remote ref', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: '', stderr: '' };
  });

  await cli.checkoutBranch('/workspace/repo', 'origin/develop');

  assert.deepEqual(calls[0].args, ['-C', '/workspace/repo', 'checkout', '-b', 'develop', 'origin/develop']);
});

test('git cli checkoutBranch keeps special characters as single argv token without shell injection', async () => {
  const calls = [];
  const cli = new GitCli(async (file, args) => {
    calls.push({ file, args });
    return { stdout: '', stderr: '' };
  });

  await cli.checkoutBranch('/workspace/repo', 'feature/修复$ bug');

  assert.deepEqual(calls[0].args, ['-C', '/workspace/repo', 'checkout', 'feature/修复$ bug']);
});
