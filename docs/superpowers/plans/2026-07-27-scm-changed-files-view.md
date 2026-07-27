# SCM Changed Files View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将改动文件从仓库节点中拆到独立的 Changed Files 视图，并支持选择仓库、分组、diff、Stage、Unstage 和 Discard。

**Architecture:** 使用共享的仓库选择状态连接两个 TreeDataProvider。仓库 provider 只渲染 dirty 仓库；文件 provider 渲染当前仓库的变更分组和文件。所有文件操作调用 VS Code 内置 Git API，Discard 在 UI 层确认后执行。

**Tech Stack:** TypeScript、VS Code Extension API、Node.js `node:test`、esbuild。

---

### Task 1: 补齐 Git 变更模型和仓库选择状态

**Files:**
- Create: `src/views/repositorySelectionState.ts`
- Create: `test/unit/repositorySelectionState.test.cjs`
- Modify: `src/domain/repositoryState.ts`
- Modify: `src/domain/repositoryChangeFiles.ts`
- Modify: `src/git/gitExtension.ts`
- Modify: `src/views/repositoryTreeItem.ts`
- Modify: `src/domain/changeOpenPlan.ts`
- Modify: related unit tests

- [ ] **Step 1: 写失败测试**

测试 `untrackedChanges` 会被计入仓库改动和文件列表；测试 selection 初始选择第一个仓库、保留仍然 dirty 的当前仓库、当前仓库清除后切换到下一个仓库。

- [ ] **Step 2: 运行失败测试**

Run: `npm run build && npm test`

Expected: 新增测试失败，因为模型尚未支持 untracked 和 selection state。

- [ ] **Step 3: 实现模型扩展**

为仓库 state 增加 `untrackedChanges`，文件 group 增加 `untracked`；状态计数和 dirty 判断包含该组。`Changed Files` 对 untracked 文件使用 `openFile` 计划。

- [ ] **Step 4: 实现 selection state**

提供 `selectedRepository`、`select(repository)`、`reconcile(repositories)` 和 `onDidChange`。使用仓库根 URI 作为稳定 key，避免 Git 状态对象刷新后引用变化导致错误切换。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run build && npm test`

Expected: 模型和 selection 测试通过，现有 diff 测试不回归。

### Task 2: 创建独立 Changed Files Tree View

**Files:**
- Create: `src/views/changedFilesProvider.ts`
- Create: `src/views/changeGroupTreeItem.ts`
- Modify: `src/views/fileChangeTreeItem.ts`
- Modify: `src/views/changedRepositoriesProvider.ts`
- Modify: `src/views/repositoryTreeItem.ts`

- [ ] **Step 1: 写失败 provider 测试**

覆盖仓库 provider 不再返回文件子节点，以及文件 provider 对当前选中仓库返回四种分组和文件节点。

- [ ] **Step 2: 运行失败测试**

Run: `npm run build && npm test`

Expected: 失败，因为 Changed Files provider 和分组节点不存在。

- [ ] **Step 3: 实现分组节点和文件 provider**

分组节点使用可展开 TreeItem；文件 provider 监听 selection state，并对当前仓库的 index、working tree、merge、untracked 变更生成对应文件节点。无选中仓库或无文件时设置空状态消息。

- [ ] **Step 4: 修改仓库节点选择行为**

仓库节点保留折叠箭头，增加 `scmRepositoryFilter.selectRepository` command，点击标签时更新 selection state；仓库 provider 的 children 只返回仓库节点。

- [ ] **Step 5: 运行 provider 测试确认通过**

Run: `npm run build && npm test`

Expected: 所有 provider 和现有测试通过。

### Task 3: 接入 Stage、Unstage、Discard

**Files:**
- Create: `test/unit/repositoryFileActions.test.cjs`
- Modify: `src/domain/repositoryActions.ts`
- Modify: `src/git/gitExtension.ts`
- Modify: `src/extension.ts`
- Modify: `src/views/fileChangeTreeItem.ts`

- [ ] **Step 1: 写失败操作测试**

测试 staged 文件调用 `revert([path])`，working tree 和 untracked 文件调用 `add([path])`，discard 调用 `clean([path])`。

- [ ] **Step 2: 运行失败测试**

Run: `npm run build && node --test test/unit/repositoryFileActions.test.cjs`

Expected: 失败，因为文件操作尚未实现。

- [ ] **Step 3: 实现纯操作映射**

按文件 group 把 `stage`、`unstage`、`discard` 映射到对应 repository API；路径取当前文件 URI 的 `fsPath`。

- [ ] **Step 4: 实现扩展命令和确认**

注册文件上下文菜单命令。Stage/Unstage 直接执行；Discard 使用模态确认，取消时不调用 API。操作成功刷新两个 provider，失败显示提示并记录日志。

- [ ] **Step 5: 运行操作测试确认通过**

Run: `npm run build && npm test`

Expected: 文件操作测试和全部已有测试通过。

### Task 4: 更新 manifest、README 和完整验证

**Files:**
- Modify: `package.json`
- Modify: `test/unit/extensionManifest.test.cjs`
- Modify: `README.md`

- [ ] **Step 1: 写失败清单测试**

断言 `Changed Files` 视图存在，文件操作命令存在，菜单只在 `Changed Files` 的对应文件 group 中出现。

- [ ] **Step 2: 添加视图和菜单**

新增 `scmRepositoryFilter.changedFiles` 视图、selection command、stage/unstage/discard commands 及上下文菜单。

- [ ] **Step 3: 更新 README**

说明仓库选择和 Changed Files 的关系，以及 Stage、Unstage、Discard 的行为和 Discard 确认。

- [ ] **Step 4: 完整验证**

Run: `npm run check`

Run: `npm run build`

Run: `npm test`

Run: `git diff --check`

手动验证多仓库选择、四类文件分组、diff、Stage、Unstage、Discard 和 Commit Staged 的边界。
