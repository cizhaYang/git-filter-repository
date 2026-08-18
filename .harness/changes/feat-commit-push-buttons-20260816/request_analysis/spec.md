# Spec: feat-commit-push-buttons

## 背景

`scmRepositoryFilter`（SCM Repository Filter）的核心使用场景是 **pinned 模式**：用户固定少数仓库（如 `acme/address`、`acme/stores`），这些仓库无论是否有改动都常驻显示在 "Changed Repositories" 视图。

当前 `commitStaged` / `pull` / `push` 命令与逻辑均已存在，但按钮在 `package.json` 的 `view/item/context` 中只挂在 `viewItem == changedRepository` 条件下——也就是**只对有改动的仓库**显示。在 pinned 模式下，被固定的常驻仓库 `contextValue == 'pinnedRepository'`，**看不到 commit / push 按钮**，只能看到 Unpin。

用户期望：**在固定的常驻仓库上也能直接提交代码和 push 代码**。

## 需求确认点（HITL）

| # | 问题 | 用户回答 | 结论 |
|---|---|---|---|
| 1 | 按钮覆盖范围 | 固定仓库也要显示 | commit/pull/push 按钮要同时出现在 `pinnedRepository` 条目上，不限是否有改动 |
| 2 | 提交交互 | 保持现状：提交已暂存内容 | 不改 commit 语义，仍是 `git commit`（不带 `--all`），需先手动 stage |
| 3 | push 上游处理 | 自动设置上游并推送 | 新分支首次 push 自动 `git push -u origin <当前分支>`，而非直接报错 |

## 现状盘点（before）

- **命令已存在**：`scmRepositoryFilter.commitStaged` / `pull` / `push` 已在 `src/extension.ts` 注册。
- **git 层已实现**：`LocalGitRepository.commit()` / `pull()` / `push()` 已封装，`runRepositoryAction` 统一调度。
- **按钮缺口**：`package.json` `view/item/context` 中，commit/pull/push 的 `when` 条件仅匹配 `changedRepository`，未匹配 `pinnedRepository`。
- **push 缺陷**：`GitCli.push()` 是裸 `git push`，新分支无 upstream 时直接报 "fatal: The current branch ... has no upstream branch"，失败信息不友好，也不自动建上游。

## 目标（after）

1. **固定仓库条目也显示 commit/pull/push 按钮**。
   - `repositoryTreeItem.ts`：pinned 仓库的 `contextValue` 需兼容——不能直接把 `pinnedRepository` 改成 `changedRepository`（会破坏 Unpin 菜单逻辑）。方案：让 pinned 仓库的 `contextValue` 同时包含两个意图，或在菜单 `when` 条件里同时匹配两种 viewItem。
   - `package.json`：为 `pinnedRepository` 追加 commit/pull/push 的 `inline` 菜单项。
2. **push 自动设置上游**：
   - `GitCli.push()` 改为「先检测是否有 upstream，无则 `push -u origin <当前分支>`」。
   - 需要新增能力读取当前分支名（`git branch --show-current`）与判断 upstream 是否存在。
3. **保持提交语义不变**：仅按钮显隐层面改动，`commitStaged` 逻辑不动。

## 非目标

- 不改 commit 的 staged-only 语义（用户明确要保留现状）。
- 不加 pull 的重base/force 选项。
- 不做 commit 成功后自动 push 的链式操作。
- 不动其它按钮（stage/unstage/discard 等）的现有挂载点。

## 分层红线约束

- 依赖单向：`views → git → domain`。Git 命令只经 `src/git/` 封装，参数数组传入 subprocess。
- 分支名/upstream 检测属于 git 能力，放 `GitCli` / `LocalGitRepository`，`domain` 不透出 raw path。
- `domain` / `git` 不 import `vscode`；commit message 输入等 UI 留在 `views` / `extension.ts`。
