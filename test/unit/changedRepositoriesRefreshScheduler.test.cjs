const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

function createEvent() {
  const listeners = new Set();
  const event = (listener) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  };
  event.fire = () => listeners.forEach((listener) => listener());
  return event;
}

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

  class TreeItem {}

  return {
    EventEmitter,
    RelativePattern: class RelativePattern {},
    ThemeIcon: class ThemeIcon {},
    TreeItem,
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

function createRepository(name, status) {
  return {
    name,
    rootUri: {
      fsPath: `/workspace/${name}`,
      toString: () => `file:///workspace/${name}`,
    },
    state: {
      indexChanges: [],
      workingTreeChanges: [],
      mergeChanges: [],
    },
    status,
  };
}

test('a completed status refresh does not cancel another repository waiting to refresh', async () => {
  const ChangedRepositoriesProvider = loadProviderWithVscodeStub();
  let finishFirstStatus;
  const firstStatusFinished = new Promise((resolve) => {
    finishFirstStatus = resolve;
  });
  let secondStatusCalls = 0;
  const first = createRepository('first', () => firstStatusFinished);
  const second = createRepository('selection', async () => {
    secondStatusCalls += 1;
  });
  const gitApi = {
    repositories: [first, second],
    onDidOpenRepository: createEvent(),
    onDidCloseRepository: createEvent(),
  };
  const selectionState = {
    reconcile() {},
  };
  const provider = new ChangedRepositoriesProvider(gitApi, selectionState);

  provider.scheduleStatusRefresh([first]);
  await delay(170);
  provider.scheduleStatusRefresh([second]);
  finishFirstStatus();
  await delay(220);

  assert.equal(secondStatusCalls, 1);
  provider.dispose();
});

test('a missed Git state event is reconciled by polling repository state', async () => {
  const ChangedRepositoriesProvider = loadProviderWithVscodeStub();
  const repository = createRepository('ordering', async () => {});
  const gitApi = {
    repositories: [repository],
    onDidOpenRepository: createEvent(),
    onDidCloseRepository: createEvent(),
  };
  let treeRefreshes = 0;
  const provider = new ChangedRepositoriesProvider(gitApi, { reconcile() {} }, undefined, 20);
  const subscription = provider.onDidChangeTreeData(() => {
    treeRefreshes += 1;
  });

  repository.state.workingTreeChanges.push({ uri: '/workspace/ordering/index.js' });
  await delay(55);

  assert.equal(treeRefreshes, 1);
  subscription.dispose();
  provider.dispose();
});

test('polling detects a changed file replacement when the change count stays equal', async (context) => {
  const ChangedRepositoriesProvider = loadProviderWithVscodeStub();
  const repository = createRepository('ordering', async () => {});
  repository.state.workingTreeChanges.push({
    uri: { toString: () => 'file:///workspace/ordering/first.js' },
    status: 'MODIFIED',
  });
  const gitApi = {
    repositories: [repository],
    onDidOpenRepository: createEvent(),
    onDidCloseRepository: createEvent(),
  };
  let treeRefreshes = 0;
  const provider = new ChangedRepositoriesProvider(gitApi, { reconcile() {} }, undefined, 20);
  context.after(() => provider.dispose());
  const subscription = provider.onDidChangeTreeData(() => {
    treeRefreshes += 1;
  });

  repository.state.workingTreeChanges[0] = {
    uri: { toString: () => 'file:///workspace/ordering/second.js' },
    status: 'MODIFIED',
  };
  await delay(55);

  assert.equal(treeRefreshes, 1);
  subscription.dispose();
});

test('a nested file refreshes only its deepest owning repository', async () => {
  const ChangedRepositoriesProvider = loadProviderWithVscodeStub();
  let parentStatusCalls = 0;
  let childStatusCalls = 0;
  const parent = createRepository('workspace', async () => {
    parentStatusCalls += 1;
  });
  parent.rootUri.fsPath = '/workspace';
  parent.rootUri.toString = () => 'file:///workspace';
  const child = createRepository('ordering', async () => {
    childStatusCalls += 1;
  });
  const gitApi = {
    repositories: [parent, child],
    onDidOpenRepository: createEvent(),
    onDidCloseRepository: createEvent(),
  };
  const provider = new ChangedRepositoriesProvider(gitApi, { reconcile() {} }, undefined, 10_000);

  provider.scheduleStatusRefreshForUri({ fsPath: '/workspace/ordering/index.js' });
  await delay(220);

  assert.equal(parentStatusCalls, 0);
  assert.equal(childStatusCalls, 1);
  provider.dispose();
});
