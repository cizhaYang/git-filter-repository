# SCM Repository Git Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Changed Repositories 仓库节点上增加只提交 staged 文件的 Commit，以及当前分支默认远程的 Pull 和 Push。

**Architecture:** 继续使用 VS Code 内置 Git API。纯逻辑层负责判断 staged 状态和把操作映射到 repository API，扩展入口负责输入框、进度、错误提示和刷新，package manifest 负责仓库节点上下文菜单。

**Tech Stack:** TypeScript、VS Code Extension API、Node.js `node:test`、esbuild。

---

### Task 1: 定义并测试仓库操作服务

**Files:**
- Create: `src/domain/repositoryActions.ts`
- Create: `test/unit/repositoryActions.test.cjs`
- Modify: `src/git/gitExtension.ts`

- [ ] **Step 1: 写失败测试**

覆盖三条行为：没有 indexChanges 时不能提交；提交调用传入 `{ all: false }`；pull/push 调用对应 API。

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { hasStagedChanges, runRepositoryAction } = require('../../dist/domain/repositoryActions.js');

function repository(state = { indexChanges: [], workingTreeChanges: [], mergeChanges: [] }) {
  const calls = [];
  return {
    state,
    calls,
    commit: async (...args) => calls.push(['commit', ...args]),
    pull: async () => calls.push(['pull']),
    push: async () => calls.push(['push']),
  };
}

test('staged commit requires at least one index change', async () => {
  const clean = repository();
  assert.equal(hasStagedChanges(clean), false);
  await assert.rejects(() => runRepositoryAction(clean, 'commit', 'message'), /No staged changes/);
});

test('staged commit never asks Git to stage all files', async () => {
  const repo = repository({ indexChanges: [{}], workingTreeChanges: [{}], mergeChanges: [] });
  assert.equal(hasStagedChanges(repo), true);
  await runRepositoryAction(repo, 'commit', 'message');
  assert.deepEqual(repo.calls, [['commit', 'message', { all: false }]]);
});

test('pull and push call the matching repository API', async () => {
  const repo = repository();
  await runRepositoryAction(repo, 'pull');
  await runRepositoryAction(repo, 'push');
  assert.deepEqual(repo.calls, [['pull'], ['push']]);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `npm run build && node --test test/unit/repositoryActions.test.cjs`

Expected: 失败，因为 `repositoryActions` 尚未实现。

- [ ] **Step 3: 实现最小操作服务**

实现 `hasStagedChanges` 和 `runRepositoryAction`。`commit` 在 index 为空时抛出 `No staged changes`，否则调用 `repository.commit(message, { all: false })`；`pull` 和 `push` 分别调用对应方法。

- [ ] **Step 4: 扩展 Git API 类型**

在 `GitRepositoryLike` 中声明：

```ts
commit(message: string, options?: { all?: boolean }): Promise<void>;
pull(): Promise<void>;
push(): Promise<void>;
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run build && node --test test/unit/repositoryActions.test.cjs`

Expected: 3 个操作测试全部通过。

### Task 2: 增加命令清单和仓库节点菜单

**Files:**
- Modify: `package.json`
- Modify: `test/unit/extensionManifest.test.cjs`

- [ ] **Step 1: 写失败清单测试**

断言 manifest 注册 `scmRepositoryFilter.commitStaged`、`scmRepositoryFilter.pull`、`scmRepositoryFilter.push`，并且三个菜单都要求 `viewItem == changedRepository`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run build && node --test test/unit/extensionManifest.test.cjs`

Expected: 失败，因为命令和菜单尚未写入 `package.json`。

- [ ] **Step 3: 添加命令和上下文菜单**

在 `contributes.commands` 增加带 Git 图标的三个命令，在 `menus.view/item/context` 增加仓库节点菜单项。菜单条件必须同时包含 `view == scmRepositoryFilter.changedRepositories` 和 `viewItem == changedRepository`。

- [ ] **Step 4: 运行清单测试确认通过**

Run: `npm run build && node --test test/unit/extensionManifest.test.cjs`

Expected: 清单测试通过。

### Task 3: 接入 Commit/Pull/Push 命令处理

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/views/repositoryTreeItem.ts`

- [ ] **Step 1: 写命令行为测试所需的纯逻辑接口**

复用 Task 1 的 `runRepositoryAction`，确保入口只负责 UI 和上下文解析，不在入口重复实现 Git 调用。

- [ ] **Step 2: 实现仓库上下文解析**

命令参数同时兼容 `RepositoryTreeItem` 和直接传入的 repository 对象，避免不同 VS Code 菜单触发路径导致仓库上下文丢失。无有效仓库时显示错误提示并返回。

- [ ] **Step 3: 实现 Commit Staged**

先通过 `hasStagedChanges` 检查 index；没有暂存文件时显示提示并结束。存在暂存文件时用 `showInputBox` 获取提交信息，取消直接返回，空白输入通过 `validateInput` 拒绝；随后以 `{ all: false }` 执行提交。

- [ ] **Step 4: 实现 Pull 和 Push**

分别执行 `runRepositoryAction(repository, 'pull')` 和 `runRepositoryAction(repository, 'push')`，不传远程名和分支名，让内置 Git API 使用当前分支默认远程。

- [ ] **Step 5: 添加统一进度、错误和刷新处理**

用 `window.withProgress({ location: vscode.ProgressLocation.Notification }, ...)` 包裹三个操作；成功后调用 provider.refresh 并提示成功；捕获异常后写入 OutputChannel 并显示错误消息，避免后台未处理 Promise。

- [ ] **Step 6: 保持仓库节点仅展开**

确认 `RepositoryTreeItem` 不设置打开目录的默认 command，保留 `contextValue = 'changedRepository'`，使普通点击行为不变、右键菜单可用。

### Task 4: 完整验证和文档同步

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-27-scm-repository-filter-design.md`（仅在需要避免旧范围描述冲突时）

- [ ] **Step 1: 更新 README 操作说明**

说明 Commit 只提交 staged 文件，Pull/Push 使用当前分支默认远程，并列出 Extension Development Host 中的验证步骤。

- [ ] **Step 2: 运行完整检查**

Run: `npm run check && npm run build && npm test && git diff --check`

Expected: 类型检查、构建、全部测试和空白检查均通过。

- [ ] **Step 3: 手动验证操作边界**

在测试仓库中准备一个已暂存文件和一个未暂存文件，执行 Commit，确认提交只包含已暂存文件；再分别执行 Pull 和 Push，确认使用默认远程并在成功或失败时显示结果。
