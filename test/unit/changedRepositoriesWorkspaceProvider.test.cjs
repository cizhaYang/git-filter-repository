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

  return {
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
    },
  };
}

function loadProviderWithVscodeStub() {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'vscode') {
      return createVscodeStub();
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../../dist/views/changedRepositoriesProvider.js');
    delete require.cache[modulePath];
    return require(modulePath).ChangedRepositoriesProvider;
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

test('provider displays dirty repositories discovered outside native Source Control', async (context) => {
  const ChangedRepositoriesProvider = loadProviderWithVscodeStub();
  const repositories = {
    '/workspace/repo-a': createRepository('/workspace/repo-a', true),
    '/workspace/repo-b': createRepository('/workspace/repo-b', false),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => Object.keys(repositories) },
    repositoryFactory: (root) => repositories[root],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();

  assert.deepEqual(provider.getChildren().map((item) => item.repository.rootUri.fsPath), ['/workspace/repo-a']);
});

test('provider refreshes its repository set when a later scan finds a new repository', async (context) => {
  const ChangedRepositoriesProvider = loadProviderWithVscodeStub();
  let roots = ['/workspace/repo-a'];
  const repositories = {
    '/workspace/repo-a': createRepository('/workspace/repo-a', true),
    '/workspace/repo-b': createRepository('/workspace/repo-b', true),
  };
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => roots },
    repositoryFactory: (root) => repositories[root],
  }, { reconcile() {} }, undefined, 0);
  context.after(() => provider.dispose());

  await provider.initialize();
  roots = ['/workspace/repo-a', '/workspace/repo-b'];
  await provider.refreshRepositories();

  assert.deepEqual(provider.getChildren().map((item) => item.repository.rootUri.fsPath), [
    '/workspace/repo-a',
    '/workspace/repo-b',
  ]);
});
