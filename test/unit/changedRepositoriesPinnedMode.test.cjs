const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createVscodeStub() {
  class EventEmitter {
    constructor() {
      this.listeners = new Set();
      this.event = (listener) => {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
      };
    }

    fire(value) {
      this.listeners.forEach((listener) => listener(value));
    }

    dispose() {
      this.listeners.clear();
    }
  }

  const config = {
    values: { scanMode: 'pinned', pinnedRepositories: [] },
    currentConfig: null,
    listeners: new Set(),
    get(key) {
      return { scanMode: config.currentConfig ?? config.values.scanMode, pinnedRepositories: config.values.pinnedRepositories }[key];
    },
    update: async (key, value) => {
      if (key === 'scanMode') config.currentConfig = value;
      if (key === 'pinnedRepositories') config.values.pinnedRepositories = value;
    },
    fireChange(keysToAffect = ['scmRepositoryFilter']) {
      // 触发所有已注册的 onDidChangeConfiguration 监听；affectsConfiguration 近似判断
      // 在该事件对象上返回 true（模拟仅影响 scmRepositoryFilter 前缀）。
      const event = {
        affectsConfiguration: (section) => keysToAffect.some((affect) => section.startsWith(affect)),
      };
      config.listeners.forEach((listener) => listener(event));
    },
  };

  const stub = {
    EventEmitter,
    RelativePattern: class RelativePattern {},
    ThemeIcon: class ThemeIcon {},
    TreeItem: class TreeItem {},
    TreeItemCollapsibleState: { None: 0 },
    workspace: {
      asRelativePath: () => '',
      createFileSystemWatcher: () => ({
        dispose() {},
        onDidChange: () => ({ dispose() {} }),
        onDidCreate: () => ({ dispose() {} }),
        onDidDelete: () => ({ dispose() {} }),
      }),
      getWorkspaceFolder: () => undefined,
      getConfiguration: () => ({ get: config.get.bind(config), update: config.update.bind(config) }),
      onDidChangeConfiguration: (listener) => {
        config.listeners.add(listener);
        return { dispose: () => config.listeners.delete(listener) };
      },
    },
  };
  stub.config = config;
  return stub;
}

function loadProviderWithVscodeStub() {
  const originalLoad = Module._load;
  const stub = createVscodeStub();
  Module._load = function load(request, parent, isMain) {
    if (request === 'vscode') {
      // 每次 load 只创建一个 stub，供模块内所有 require("vscode") 复用，
      // 保证 provider 注册的配置监听落在测试持有的同一个 config 上。
      return stub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../../dist/views/changedRepositoriesProvider.js');
    delete require.cache[modulePath];
    return { ChangedRepositoriesProvider: require(modulePath).ChangedRepositoriesProvider, vscodeStub: stub };
  } finally {
    Module._load = originalLoad;
  }
}

function createRepository(rootPath, dirty) {
  return {
    name: rootPath.split('/').pop(),
    rootUri: {
      fsPath: rootPath,
      toString: () => `file://${rootPath}`,
    },
    state: {
      indexChanges: dirty ? [{ uri: { fsPath: `${rootPath}/index.ts` } }] : [],
      workingTreeChanges: [],
      mergeChanges: [],
      untrackedChanges: [],
    },
    async status() {},
  };
}

test('pinned mode always renders a clean workspace root repository without pin semantics', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const rootRepository = createRepository('/workspace', false);
  let fullScanCalls = 0;
  let shallowScanCalls = 0;
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => { fullScanCalls += 1; return ['/workspace']; },
      scanWorkspaceRoots: async () => { shallowScanCalls += 1; return ['/workspace']; },
    },
    repositoryFactory: () => rootRepository,
    scanMode: 'pinned',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  const items = provider.getChildren();
  assert.deepEqual(items.map((item) => item.repository.rootUri.fsPath), ['/workspace']);
  assert.equal(items[0].contextValue, 'changedRepository');
  assert.equal(provider.getMessage(), undefined);
  assert.equal(shallowScanCalls, 1);
  assert.equal(fullScanCalls, 0);
});

test('pinned mode keeps the workspace root ordinary while pinned child repositories retain pin semantics', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace': createRepository('/workspace', false),
    '/workspace/originSource/acme/stores': createRepository('/workspace/originSource/acme/stores', false),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => Object.keys(repositories),
      scanWorkspaceRoots: async () => ['/workspace'],
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'pinned',
    getPinnedRelativePaths: () => ['.', 'originSource/acme/stores'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  const items = provider.getChildren();
  const root = items.find((item) => item.repository.rootUri.fsPath === '/workspace');
  const child = items.find((item) => item.repository.rootUri.fsPath === '/workspace/originSource/acme/stores');
  assert.equal(root.contextValue, 'changedRepository');
  assert.equal(child.contextValue, 'pinnedRepository');
  assert.equal(provider.isPinnedRoot('/workspace'), false);
  assert.equal(provider.isPinnedRoot('/workspace/originSource/acme/stores'), true);
});

test('all mode keeps a clean workspace root visible next to dirty nested repositories', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace': createRepository('/workspace', false),
    '/workspace/dirty': createRepository('/workspace/dirty', true),
    '/workspace/clean': createRepository('/workspace/clean', false),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => Object.keys(repositories),
      scanWorkspaceRoots: async () => ['/workspace'],
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'all',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();
  await new Promise((resolve) => setImmediate(resolve));

  const items = provider.getChildren();
  assert.deepEqual(
    items.map((item) => item.repository.rootUri.fsPath).sort(),
    ['/workspace', '/workspace/dirty'],
  );
  assert.equal(items.find((item) => item.repository.rootUri.fsPath === '/workspace').contextValue, 'changedRepository');
});

test('all mode keeps workspace root and pinned repositories omitted by the recursive scan', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace': createRepository('/workspace', false),
    '/workspace/pinned': createRepository('/workspace/pinned', false),
    '/workspace/dirty': createRepository('/workspace/dirty', true),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => ['/workspace/dirty'],
      scanWorkspaceRoots: async () => ['/workspace'],
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'all',
    getPinnedRelativePaths: () => ['pinned'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    provider.getChildren().map((item) => item.repository.rootUri.fsPath).sort(),
    ['/workspace', '/workspace/dirty', '/workspace/pinned'],
  );
});

test('all mode keeps workspace root and pinned repositories when recursive scanning fails', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace': createRepository('/workspace', false),
    '/workspace/pinned': createRepository('/workspace/pinned', false),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => { throw new Error('recursive scan failed'); },
      scanWorkspaceRoots: async () => ['/workspace'],
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'all',
    getPinnedRelativePaths: () => ['pinned'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    provider.getChildren().map((item) => item.repository.rootUri.fsPath).sort(),
    ['/workspace', '/workspace/pinned'],
  );
});

test('pinned mode only keeps workspace roots confirmed by the shallow scan in a multi-root workspace', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace-a': createRepository('/workspace-a', false),
    '/workspace-b': createRepository('/workspace-b', false),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace-a', '/workspace-b'],
    scanner: {
      scan: async () => Object.keys(repositories),
      scanWorkspaceRoots: async () => ['/workspace-a'],
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'pinned',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  assert.deepEqual(provider.getChildren().map((item) => item.repository.rootUri.fsPath), ['/workspace-a']);
});

test('pinned mode keeps fixed repositories when workspace root scanning fails', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const fixedRepository = createRepository('/workspace/originSource/acme/stores', false);
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => { throw new Error('permission denied'); },
      scanWorkspaceRoots: async () => { throw new Error('permission denied'); },
    },
    repositoryFactory: () => fixedRepository,
    scanMode: 'pinned',
    getPinnedRelativePaths: () => ['originSource/acme/stores'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  assert.deepEqual(
    provider.getChildren().map((item) => item.repository.rootUri.fsPath),
    ['/workspace/originSource/acme/stores'],
  );
});

test('pinned mode renders pinned repositories even when they have zero changes', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace/originSource/acme/address': createRepository('/workspace/originSource/acme/address', false),
    '/workspace/originSource/acme/stores': createRepository('/workspace/originSource/acme/stores', false),
    '/workspace/other': createRepository('/workspace/other', true),
  };
  let scanCalls = 0;
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => { scanCalls += 1; return Object.keys(repositories); } },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'pinned',
    getPinnedRelativePaths: () => ['originSource/acme/address', 'originSource/acme/stores'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  // 两个固定仓库都常驻显示（即使零改动），且其它未固定仓库不出现。
  assert.deepEqual(
    provider.getChildren().map((item) => item.repository.rootUri.fsPath).sort(),
    ['/workspace/originSource/acme/address', '/workspace/originSource/acme/stores'],
  );
  // pinned 模式刷新阶段不触发全量扫描。
  assert.equal(scanCalls, 0);
});

test('all mode merges changed repos with pinned repos and marks pinned items', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace/originSource/acme/address': createRepository('/workspace/originSource/acme/address', false),
    '/workspace/dirty': createRepository('/workspace/dirty', true),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => Object.keys(repositories) },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'all',
    getPinnedRelativePaths: () => ['originSource/acme/address'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  const items = provider.getChildren();
  assert.deepEqual(
    items.map((item) => item.repository.rootUri.fsPath).sort(),
    ['/workspace/dirty', '/workspace/originSource/acme/address'],
  );
  // 固定条目带 pinned 图标，未固定但有改动的条目不带。
  const pinned = items.find((i) => i.repository.rootUri.fsPath === '/workspace/originSource/acme/address');
  const dirty = items.find((i) => i.repository.rootUri.fsPath === '/workspace/dirty');
  assert.equal(pinned.contextValue, 'pinnedRepository');
  assert.equal(dirty.contextValue, 'changedRepository');
});

test('pinned mode with an empty pinned list shows a hint message', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => ['/workspace/a'] },
    repositoryFactory: (root) => ({ rootUri: { fsPath: root, toString: () => `file://${root}` }, name: 'a', state: { indexChanges: [], workingTreeChanges: [], mergeChanges: [] }, async status() {} }),
    scanMode: 'pinned',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  assert.match(provider.getMessage(), /No pinned repositories/);
});

test('switching scanMode from pinned to all rebuilds and scans all repositories', async (context) => {
  const { ChangedRepositoriesProvider, vscodeStub } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace/pinned': createRepository('/workspace/pinned', false),
    '/workspace/dirty': createRepository('/workspace/dirty', true),
  };
  let scanCalls = 0;
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => { scanCalls += 1; return Object.keys(repositories); } },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'pinned',
    getPinnedRelativePaths: () => ['pinned'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();
  // pinned 阶段只显示固定仓库，不触发全量扫描。
  assert.deepEqual(provider.getChildren().map((i) => i.repository.rootUri.fsPath), ['/workspace/pinned']);
  assert.equal(scanCalls, 0);

  // 切到 all：触发配置变化 → 全量扫描 → 显示改动仓库 ∪ 固定仓库。
  await vscodeStub.config.update('scanMode', 'all');
  vscodeStub.config.fireChange();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(provider.getChildren().map((i) => i.repository.rootUri.fsPath).sort(), [
    '/workspace/dirty',
    '/workspace/pinned',
  ]);
  assert.equal(scanCalls, 1);
});

test('switching scanMode from all to pinned ignores a stale all-mode scan result', async (context) => {
  const { ChangedRepositoriesProvider, vscodeStub } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace/pinned': createRepository('/workspace/pinned', false),
    '/workspace/dirty': createRepository('/workspace/dirty', true),
  };
  let completeAllScan;
  const allScan = new Promise((resolve) => {
    completeAllScan = resolve;
  });
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scanWorkspaceRoots: async () => [],
      scan: async () => allScan,
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'all',
    getPinnedRelativePaths: () => ['pinned'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  // initialize 会在后台启动 all 模式递归扫描，但不会等待其完成。
  await provider.initialize();
  await vscodeStub.config.update('scanMode', 'pinned');
  vscodeStub.config.fireChange();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(provider.getChildren().map((item) => item.repository.rootUri.fsPath), ['/workspace/pinned']);

  // 模式切换前启动的扫描即使稍后完成，也不能把非固定仓库写回 pinned 视图。
  completeAllScan(Object.keys(repositories));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(provider.getChildren().map((item) => item.repository.rootUri.fsPath), ['/workspace/pinned']);
});

test('switching scanMode from all to pinned never publishes a stale initialization scan result', async (context) => {
  const { ChangedRepositoriesProvider, vscodeStub } = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace/pinned': createRepository('/workspace/pinned', false),
    '/workspace/dirty': createRepository('/workspace/dirty', true),
  };
  let completeWorkspaceRootScan;
  const workspaceRootScan = new Promise((resolve) => {
    completeWorkspaceRootScan = resolve;
  });
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scanWorkspaceRoots: async () => workspaceRootScan,
      scan: async () => Object.keys(repositories),
    },
    repositoryFactory: (root) => repositories[root],
    scanMode: 'all',
    getPinnedRelativePaths: () => ['pinned'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  const initializePromise = provider.initialize();
  await vscodeStub.config.update('scanMode', 'pinned');
  const publishedRoots = [];
  const subscription = provider.onDidChangeTreeData(() => {
    publishedRoots.push(provider.getChildren().map((item) => item.repository.rootUri.fsPath).sort());
  });
  context.after(() => subscription.dispose());
  vscodeStub.config.fireChange();
  await new Promise((resolve) => setImmediate(resolve));

  completeWorkspaceRootScan(['/workspace/dirty']);
  await initializePromise;
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(publishedRoots.length > 0);
  assert.deepEqual(
    publishedRoots,
    publishedRoots.map(() => ['/workspace/pinned']),
  );
});

test('all mode with no changes but pinned repos present does not report "no changed repositories"', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => ['/workspace/pinned'] },
    repositoryFactory: (root) => createRepository(root, false),
    scanMode: 'all',
    getPinnedRelativePaths: () => ['pinned'],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  // 有固定仓库常驻但零改动：不得显示「没有改动仓库」空态文案。
  assert.equal(provider.getChildren().length, 1);
  assert.equal(provider.getMessage(), undefined);
});

test('all mode with neither changes nor pinned repos falls back to the empty message', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => ['/workspace/clean'] },
    repositoryFactory: (root) => createRepository(root, false),
    scanMode: 'all',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  assert.equal(provider.getChildren().length, 0);
  assert.match(provider.getMessage(), /No changed repositories/);
});

test('discoverRepositoryRoots in pinned mode uses the shallow scan, not the full recursive scan', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  let fullScanCalls = 0;
  let shallowScanCalls = 0;
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => { fullScanCalls += 1; return []; },
      scanWorkspaceRoots: async () => { shallowScanCalls += 1; return []; },
    },
    repositoryFactory: (root) => createRepository(root, false),
    scanMode: 'pinned',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.discoverRepositoryRoots();
  assert.equal(fullScanCalls, 0);
  assert.equal(shallowScanCalls, 1);
});

test('discoverAllRepositoryRoots in pinned mode performs the full recursive scan as a fallback', async (context) => {
  const { ChangedRepositoriesProvider } = loadProviderWithVscodeStub();
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: {
      scan: async () => ['/workspace/originSource/acme/address', '/workspace/originSource/acme/ordering'],
      scanWorkspaceRoots: async () => [],
    },
    repositoryFactory: (root) => createRepository(root, false),
    scanMode: 'pinned',
    getPinnedRelativePaths: () => [],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  const roots = await provider.discoverAllRepositoryRoots();
  assert.ok(roots.includes('/workspace/originSource/acme/address'));
  assert.ok(roots.includes('/workspace/originSource/acme/ordering'));
  // 全量扫描即使发现嵌套仓库，也只补充进兜底方法，不改变浅层 discoverRepositoryRoots 的结果集。
  const shallow = await provider.discoverRepositoryRoots();
  assert.equal(shallow.length, 0);
});
