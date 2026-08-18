# Spec: feat-show-branch-and-switch

## 背景

`scmRepositoryFilter` 的 "Changed Repositories" 视图是用户聚焦少数仓库的核心入口。当前每个仓库条目只展示仓库名 + 相对路径，用户无法在视图内直接看到该仓库当前在哪个分支上，更无法切换分支——需要切到别处的 Git Graph / 内置 SCM 或命令行去操作。

用户期望：**在仓库条目上直接看到当前分支，并能点击切换分支**，减少在两个工具间来回切换的成本。

## 需求确认点（HITL）

| # | 问题 | 用户回答 | 结论 |
|---|---|---|---|
| 1 | 切换交互 | QuickPick 选择 | 点击"切换分支"按钮，弹出快速选择列表（本地 + 远端分支），选中即 `git checkout <branch>` |
| 2 | 未提交改动冲突 | 直接报错提示 | checkout 失败时弹错误消息给用户，让他自行处理改动；**不自动 stash** |
| 3 | 分支显示位置 | 描述行追加 | 仓库条目 description 由 `相对路径` 变为 `相对路径 · 分支名`（如 `acme/address · main`） |
| 4 | 点击行为 | 加 Switch 按钮（不冲突） | **保持点击仓库 = 选中看文件不变**；新增内联"切换分支"按钮，点击按钮才弹分支列表。不改变 `selectRepository` 现有行为 |

## 现状盘点（before）

- **分支读取已存在但私有**：`GitCli.getCurrentBranch()`（`git branch --show-current`）已在 `src/git/gitCli.ts` 实现，仅供 `push` 探测上游使用，未暴露给上层，`GitRepositoryLike` 也不携带分支信息。
- **无列出分支能力**：`GitCli` 没有 `listBranches()`（QuickPick 需要列出 local + remote 分支）。
- **无切换分支能力**：`GitCli` / `LocalGitRepository` 都没有 `checkout`；`RepositoryAction` 只支持 commit/pull/push。
- **description 无分支**：`repositoryTreeItem.ts` 的 `description` 只显示相对路径，`tooltip` 也只显示路径 + 改动数。

## 目标（after）

1. **仓库条目显示当前分支**：
   - `GitRepositoryLike` / `LocalGitRepository` 新增 `currentBranch: string | undefined` 字段，在 `status()` 刷新时一并读取（`git branch --show-current`）并缓存。
   - `repositoryTreeItem.ts`：`description` 变为 `相对路径 · 分支名`；无分支（detached HEAD / 无 git）时回退纯路径。
   - `changedRepositoriesProvider.ts` 的 `getRepositoryStateSignature()` 纳入分支维度，使外部切分支也能被对账刷新感知。
2. **列出分支**：
   - `GitCli.listBranches(rootPath)` 返回当前仓库可用分支（local + remote 去重，供 QuickPick），分支名以 argv 数组安全传入。
3. **切换分支**：
   - `LocalGitRepository.switchBranch(branchName)` → `gitCli.checkout(branchName)`。
   - 切换成功后触发仓库 status + 刷新（现有 `scheduleStatusRefresh([repository])` 复用）。
   - 冲突（未提交改动、无该分支）时由 git 报错，弹错误消息，**不自动 stash**。
4. **命令 / UI**：
   - `src/extension.ts` 注册 `scmRepositoryFilter.switchBranch`（target = 仓库），命令内 `showQuickPick` 选分支 → 走进度 → checkout → 刷新。
   - `package.json` 注册 command + `view/item/context` 的 `inline` 菜单（`git-branch` 图标，`when` 同时匹配 `changedRepository | pinnedRepository`）。

## 非目标

- **不改变点击仓库条目的行为**（`selectRepository` 选中看文件保持现状）。
- **不自动 stash**（用户明确选择"直接报错提示"）。
- 不做分支的新建/删除/合并/拉取远端更新——只切换既有分支。
- 不显示提交历史 / 不引入 Git Graph 级别能力（分支仅是"当前所在 + 可切换"）。
- 不把分支放进 `LocalGitState` 变更集结构（它属于"仓库级元信息"，与四类变更分离，避免污染 `RepositoryLikeForFiltering` 过滤语义）。

## 核心场景（用户故事）

1. **查看分支**：用户在 pinned 模式看到 `acme/address · main`，一眼得知当前分支。
2. **切换分支**：点 `acme/address` 条目上的"切换分支"按钮 → QuickPick 列出本地 `main` / `feature/x` + 远端 `origin/develop` → 选中 `feature/x` → withProgress 执行 checkout → 成功 toast + 两个 Tree View 刷新，description 更新为 `acme/address · feature/x`。
3. **切分支冲突**：某仓库有未提交改动，checkout 失败 → 弹错误 `git checkout ... failed: Your local changes would be overwritten by checkout`，分支保持原样，改动不变。
4. **外部切分支**：用户在命令行 `git checkout develop` → 下一次 status 刷新/对账后，视图 description 自动变 `· develop`。

## 验收标准（可程序化校验）

1. `npm run check`（tsc --noEmit）exit 0。
2. `npm test` 新增用例、全绿，pass 数 > 0：
   - `gitCli.test.cjs`：`listBranches` 正确解析 local + remote 分支、`checkout` 以 argv 数组传分支名（安全，含空格/多字节分支名用例）。
   - `localGitRepository` 相关测试：`switchBranch` 委托给 gitCli，`status()` 后 `currentBranch` 被填充。
   - `repositoryTreeItem` 测试：description 含 `· 分支`；无分支时回退纯路径。
   - `getRepositoryStateSignature`（在 provider 测试或独立函数测试）：分支变化改变签名，触发对账刷新。
3. `npm run harness:doctor` 0 errors 0 warnings。
4. 真实 git 集成验证（手测）：分支显示、本地/远端分支切换、冲突报错、外部切分支后视图同步。
5. `package.json` 新增 `switchBranch` 命令与 `src/extension.ts` 注册命令交叉比对通过（doctor 的 docs 漂移检测）。

## 风险与权衡

- **每次 status 刷新多一次 `git branch --show-current` 调用**：成本极低（本地命令），且只在刷新时执行，不会阻塞；`currentBranch` 与 status 在同一批并发读取，不新增串行往返。
- **QuickPick 分支列表可能很长**（远端分支多）：用 `git branch --all` 并去重显示简名，可作为已知限制，不在此 change 分页处理。
- **detached HEAD / 非 git 仓库**：`getCurrentBranch` 返回 undefined 时回退旧 description，不报错、不打断视图。
- **checkout 改变工作区内容**：可能影响 diff/打开的文件——切换后刷新状态是既有机制；若用户打开着 diff 视图，其内容基于 blob 快照，不强制重载（已知限制）。

## 分层红线约束

- 依赖单向 `views → git → domain`；`domain` / `git` 不 import `vscode`。
- 分支读取/列出/切换全部为 git 能力，放 `GitCli` / `LocalGitRepository`，分支名以 argv 数组传 subprocess，禁止拼 shell 字符串。
- QuickPick、withProgress、错误 toast 等 UI 留在 `views` / `extension.ts`。
- `switchBranch` 作为新的 `RepositoryAction` 走 `runRepositoryOperation` 的进度/错误模板（若复用），或不扩展 action 类型、由 extension.ts 单独封装——以最小改动为准。
- 无 `console.log`，仅 `console.warn` / `console.error` 带语义前缀（git 层现有 `[git]` 前缀沿用）。
