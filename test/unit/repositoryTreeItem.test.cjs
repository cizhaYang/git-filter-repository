const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createVscodeStub() {
  const treeItems = [];
  class ThemeIcon {
    constructor(icon) {
      this.icon = icon;
    }
  }
  class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
      treeItems.push(this);
    }
  }
  return {
    TreeItem,
    ThemeIcon,
    TreeItemCollapsibleState: { None: 0 },
    workspace: {
      asRelativePath: () => '',
      getWorkspaceFolder: () => undefined,
    },
    treeItems,
  };
}

function loadRepositoryTreeItemWithVscodeStub() {
  const originalLoad = Module._load;
  const stub = createVscodeStub();
  Module._load = function load(request, parent, isMain) {
    if (request === 'vscode') {
      return stub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../../dist/views/repositoryTreeItem.js');
    delete require.cache[modulePath];
    return { RepositoryTreeItem: require(modulePath).RepositoryTreeItem, vscodeStub: stub };
  } finally {
    Module._load = originalLoad;
  }
}

function createRepository(fsPath, changeCount) {
  const indexChanges = Array.from({ length: changeCount }, (_, i) => ({ uri: { fsPath: `${fsPath}/file-${i}` } }));
  return {
    rootUri: { fsPath, toString: () => `file://${fsPath}` },
    name: fsPath.split('/').pop(),
    state: { indexChanges, workingTreeChanges: [], mergeChanges: [], untrackedChanges: [] },
  };
}

test('RepositoryTreeItem non-pinned uses repo icon and changedRepository context', () => {
  const { RepositoryTreeItem, vscodeStub } = loadRepositoryTreeItemWithVscodeStub();
  const item = new RepositoryTreeItem(createRepository('/workspace/repo', 3), undefined, false);
  assert.equal(item.contextValue, 'changedRepository');
  assert.equal(item.iconPath.icon, 'repo');
  assert.match(item.tooltip, /3 changes/);
});

test('RepositoryTreeItem pinned uses pinned icon and pinnedRepository context', () => {
  const { RepositoryTreeItem, vscodeStub } = loadRepositoryTreeItemWithVscodeStub();
  const item = new RepositoryTreeItem(createRepository('/workspace/repo', 0), undefined, true);
  assert.equal(item.contextValue, 'pinnedRepository');
  assert.equal(item.iconPath.icon, 'pinned');
  assert.match(item.tooltip, /0 changes/);
});

test('RepositoryTreeItem command always selects the repository', () => {
  const { RepositoryTreeItem, vscodeStub } = loadRepositoryTreeItemWithVscodeStub();
  const repo = createRepository('/workspace/repo', 1);
  const item = new RepositoryTreeItem(repo, undefined, false);
  assert.equal(item.command.command, 'scmRepositoryFilter.selectRepository');
  assert.equal(item.command.arguments[0], repo);
});
