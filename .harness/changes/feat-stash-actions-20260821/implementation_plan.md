# Stash Repository Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Changed Repositories 仓库行最右侧增加 ellipsis 更多入口，支持输入 message 创建 stash，以及从列表选择并 apply stash。

**Architecture:** Git 命令和 stash 列表解析收口在 `src/git/gitCli.ts`，`LocalGitRepository` 只做仓库根路径适配；`src/domain/repositoryActions.ts` 提供可 stash 的 tracked 改动判断；`src/extension.ts` 编排 Quick Pick、输入框、进度、通知和状态刷新。`package.json` 只暴露一个 `repositoryMoreActions` 行内命令，两个 stash 操作作为其 Quick Pick 选项。

**Tech Stack:** TypeScript 5 strict、VS Code Extension API、Node.js `node:test`、Git CLI、esbuild。

---

### Task 1: Git stash CLI 能力

**Files:**
- Modify: `test/unit/gitCli.test.cjs`
- Modify: `src/git/gitCli.ts`
- Modify: `src/git/localGitRepository.ts`

- [x] **Step 1: 写 GitCli 失败测试**

在 `test/unit/gitCli.test.cjs` 增加用例，断言：

```js
await cli.stash('/workspace/repo', 'WIP: 修复 $PATH');
const stashes = await cli.listStashes('/workspace/repo');
await cli.applyStash('/workspace/repo', 'stash@{1}');

assert.deepEqual(calls.map((call) => call.args), [
  ['-C', '/workspace/repo', 'stash', 'push', '-m', 'WIP: 修复 $PATH'],
  ['-C', '/workspace/repo', 'stash', 'list', '--format=%gd%x00%gs%x00'],
  ['-C', '/workspace/repo', 'stash', 'apply', 'stash@{1}'],
]);
assert.deepEqual(stashes, [
  { ref: 'stash@{0}', description: 'On main: WIP: first' },
  { ref: 'stash@{1}', description: 'On feature/x: 修复: second item' },
]);
```

另增空输出用例，断言 `listStashes()` 返回 `[]`。

- [x] **Step 2: 运行定向测试确认 RED**

Run: `npm run build && node --test test/unit/gitCli.test.cjs`

Expected: FAIL，原因是 `GitCli.stash/listStashes/applyStash` 尚未定义。

- [x] **Step 3: 实现最小 GitCli API**

在 `src/git/gitCli.ts` 定义：

```ts
export interface GitStashEntry {
  ref: string;
  description: string;
}

async stash(rootPath: string, message: string): Promise<void> {
  await this.run(rootPath, ['stash', 'push', '-m', message]);
}

async listStashes(rootPath: string): Promise<GitStashEntry[]> {
  const result = await this.run(rootPath, ['stash', 'list', '--format=%gd%x00%gs%x00']);
  return parseStashList(result.stdout);
}

async applyStash(rootPath: string, ref: string): Promise<void> {
  await this.run(rootPath, ['stash', 'apply', ref]);
}
```

`parseStashList` 以 NUL 成对读取 ref/description，只清理 Git 在记录间追加的换行，不用冒号拆分描述；奇数字段或空 ref 抛出显式格式错误。

- [x] **Step 4: 接入 LocalGitRepository**

在 `GitRepositoryLike` 和 `LocalGitRepository` 增加：

```ts
stash(message: string): Promise<void>;
listStashes(): Promise<GitStashEntry[]>;
applyStash(ref: string): Promise<void>;
```

三个方法只把 `rootUri.fsPath` 与参数转发给 `GitCli`。

- [x] **Step 5: 运行定向测试确认 GREEN**

Run: `npm run build && node --test test/unit/gitCli.test.cjs`

Expected: GitCli 全部用例 PASS。

### Task 2: 可 stash 状态判断

**Files:**
- Modify: `test/unit/repositoryActions.test.cjs`
- Modify: `src/domain/repositoryActions.ts`

- [x] **Step 1: 写失败测试**

增加 `hasTrackedChangesForStash` 用例：

```js
assert.equal(hasTrackedChangesForStash(repository({ indexChanges: [{}], workingTreeChanges: [], mergeChanges: [], untrackedChanges: [] })), true);
assert.equal(hasTrackedChangesForStash(repository({ indexChanges: [], workingTreeChanges: [{}], mergeChanges: [], untrackedChanges: [] })), true);
assert.equal(hasTrackedChangesForStash(repository({ indexChanges: [], workingTreeChanges: [], mergeChanges: [{}], untrackedChanges: [] })), true);
assert.equal(hasTrackedChangesForStash(repository({ indexChanges: [], workingTreeChanges: [], mergeChanges: [], untrackedChanges: [{}] })), false);
```

- [x] **Step 2: 运行定向测试确认 RED**

Run: `npm run build && node --test test/unit/repositoryActions.test.cjs`

Expected: FAIL，原因是 `hasTrackedChangesForStash` 尚未定义。

- [x] **Step 3: 实现纯判断函数**

```ts
export function hasTrackedChangesForStash(repository: Pick<GitRepositoryLike, 'state'>): boolean {
  return repository.state.indexChanges.length > 0
    || repository.state.workingTreeChanges.length > 0
    || repository.state.mergeChanges.length > 0;
}
```

此判断故意不读 `untrackedChanges`，与不传 `--include-untracked` 的 Git 语义一致。

- [x] **Step 4: 运行定向测试确认 GREEN**

Run: `npm run build && node --test test/unit/repositoryActions.test.cjs`

Expected: repository action 全部用例 PASS。

### Task 3: 更多入口与 manifest

**Files:**
- Modify: `test/unit/extensionManifest.test.cjs`
- Modify: `package.json`

- [x] **Step 1: 写 manifest 失败测试**

断言 `scmRepositoryFilter.repositoryMoreActions` 已注册，icon 为 `$(ellipsis)`，菜单条件覆盖 `changedRepository` 和 `pinnedRepository`，group 为 `inline`，并位于当前仓库行其它 inline 项之后。

- [x] **Step 2: 运行测试确认 RED**

Run: `node --test test/unit/extensionManifest.test.cjs`

Expected: FAIL，原因是 manifest 尚未声明命令和菜单。

- [x] **Step 3: 增加 manifest 命令和菜单**

在 `contributes.commands` 增加：

```json
{
  "command": "scmRepositoryFilter.repositoryMoreActions",
  "title": "More Repository Actions",
  "icon": "$(ellipsis)"
}
```

在仓库行 inline 菜单最后增加同 ID 条目，when 为 Changed Repositories 且匹配两类 repository context value。

- [x] **Step 4: 运行 manifest 测试确认 GREEN**

Run: `node --test test/unit/extensionManifest.test.cjs`

Expected: manifest 用例 PASS。

### Task 4: Extension 交互与刷新闭环

**Files:**
- Modify: `src/extension.ts`
- Modify: `.harness/wiki/architecture.md`

- [x] **Step 1: 注册更多操作命令**

在 `activate()` 注册 `scmRepositoryFilter.repositoryMoreActions`，解析 repository target 失败时显示现有风格的错误提示，成功时调用 `showRepositoryMoreActions()`。

- [x] **Step 2: 实现两项 Quick Pick**

Quick Pick item 固定为：

```ts
const action = await vscode.window.showQuickPick([
  { label: 'Stash', action: 'stash' as const },
  { label: 'Apply Stash', action: 'applyStash' as const },
], { placeHolder: `Select an action for ${displayName}` });
```

取消直接返回；选中后分发到 `createStash()` 或 `applyStash()`。

- [x] **Step 3: 实现创建 stash 交互**

先调用 `hasTrackedChangesForStash`，不可 stash 时提示 `No tracked changes to stash in <repo>.`。否则使用 `showInputBox` 获取必填 message，以 Notification progress 调用 `repository.stash(message.trim())`，成功后调度当前仓库 status 刷新并提示成功；失败写 OutputChannel 并显示 Git 错误。

- [x] **Step 4: 实现 apply stash 交互**

先用 Notification progress 读取 `repository.listStashes()`；空列表提示 `No stashes found in <repo>.`。非空列表用 Quick Pick 展示 `ref` 为 label、description 为 detail，取消不执行 apply。选中后用 Notification progress 调用 `repository.applyStash(ref)`，成功提示但不删除 stash；apply 进入 Git 后在 `finally` 调度当前仓库 status 刷新，确保冲突失败也对账。

- [x] **Step 5: 同步扩展点登记**

在 `.harness/wiki/architecture.md` 命令表增加 `scmRepositoryFilter.repositoryMoreActions`，用途标注为打开 Stash/Apply Stash 更多操作。

- [x] **Step 6: 运行编码阶段门禁**

Run: `npm run check && npm run build`

Expected: TypeScript 检查和 esbuild 都退出 0。

### Task 5: 评审、测试与交付记录

**Files:**
- Create: `.harness/changes/feat-stash-actions-20260821/coding/coding_report_v1.md`
- Create: `.harness/changes/feat-stash-actions-20260821/coding/review/code_review_v1.md`
- Create: `.harness/changes/feat-stash-actions-20260821/unit_test/test_plan.md`
- Create: `.harness/changes/feat-stash-actions-20260821/unit_test/test_review_v1.md`
- Create: `.harness/changes/feat-stash-actions-20260821/ci_result/ci_summary.md`
- Modify: `.harness/changes/feat-stash-actions-20260821/summary.md`

- [x] **Step 1: 写编码报告并更新步骤 2**

记录改动文件、公共出口、Git argv 与刷新边界，将 summary 的编码状态置为 DONE。

- [x] **Step 2: 执行静态代码评审**

按 `.harness/skills/code-review/SKILL.md` 和 execution reviewer 检查分层、命令注入、错误刷新与超范围改动，输出 verdict；有 MUST FIX 回 Task 1-4 修复。

- [x] **Step 3: 运行全量测试与 CI**

Run: `npm run check && npm run build && npm test && npm run harness:doctor && git diff --check`

Expected: 所有命令退出 0，`npm test` 报告 `pass > 0`，doctor 报告 0 errors。

- [x] **Step 4: 写测试计划、评审和 CI 摘要**

记录 happy/edge/security 用例、命令输出摘要和残余的 Extension Development Host 手动交互风险，将 summary 的步骤 3-4 置为 DONE。

- [x] **Step 5: 停在提交门禁前**

本轮不自动提交或打包 VSIX；向用户报告验证结果和工作树状态，等待发布参数/提交确认。
