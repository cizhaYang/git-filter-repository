# Tasks: feat-commit-push-buttons

## 任务分解

### 任务 1：固定仓库条目显示 commit/pull/push 按钮

**改动文件**
- `package.json` `contributes.menus["view/item/context"]`
- `src/views/repositoryTreeItem.ts`（如需调整 contextValue）

**方案**：pinned 仓库 `contextValue` 保持 `pinnedRepository`（Unpin 依赖它），为它追加 commit/pull/push 菜单项。由于 menu `when` 是 VS Code 表达式，追加 `|| viewItem == 'pinnedRepository'` 到三个 `inline` 项即可，或复制份 pinned 专属项。**注意 vsce 校验**：`viewItem/context` 菜单 `when` 支持 `||` 表达式。

**验收**：
- [ ] pinned 常驻仓库条目出现 commit/pull/push 内联按钮
- [ ] 有改动仓库条目按钮保持可用
- [ ] Unpin 仍只在 pinned 条目出现（回归）

**测试**：
- `extensionManifest.test.cjs`：断言菜单 `when` 同时覆盖 `changedRepository` 与 `pinnedRepository`（避免文档漂移）
- `repositoryTreeItem.test.cjs`：断言 pinned 仓库 contextValue 仍为 `pinnedRepository`（回归，防 Unpin 被破坏）

---

### 任务 2：push 自动设置上游（新分支友好推送）

**改动文件**
- `src/git/gitCli.ts`
- `src/git/localGitRepository.ts`（接口 `push` 若需暴露分支名/upstream 状态）

**方案**：`GitCli.push()` 改为先查询当前分支与 upstream：
1. `git branch --show-current` 拿当前分支名。
2. 判断是否已有 upstream：`git rev-parse --abbrev-ref <branch>@{upstream}` 成功即有，失败无。
3. 无 upstream → `git push -u origin <branch>`；有 → `git push`。

`LocalGitRepository` 可能需要暴露 `push(options?: { setUpstream?: boolean })` 或让 `GitCli.push` 内部处理。**倾向 GitCli 内部自处理**：把「查分支 + 判断 upstream + push」封装为一次 `GitCli.pushWithSetUpstream()`，domain/UI 无感知，保持分层干净。

**验收**：
- [ ] 已有 upstream 的分支，`git push` 正常成功
- [ ] 无 upstream 的新分支，自动 `git push -u origin <当前分支>`
- [ ] push 失败仍走现有错误提示（`runRepositoryOperation` 捕获）
- [ ] Git 命令一律数组参数，无 shell 字符串拼接

**测试（TDD，`gitCli.test.cjs`）**：
- 无 upstream 时调用 `push -u origin <branch>`
- 有 upstream 时调用裸 `push`
- 查分支命令参数正确（`branch --show-current`）

---

### 任务 3：验证与收尾

- [ ] `npm run check`（tsc --noEmit）exit 0
- [ ] `npm test` 全绿（新增用例 > 0）
- [ ] `harness:doctor` 0 errors（extension.ts 命令与 architecture.md 交叉比对）
