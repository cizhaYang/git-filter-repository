# Tasks: feat-show-branch-and-switch

## 任务分解

### 任务 1：Git 层提供分支读取 / 列出 / 切换能力

**改动文件**
- `src/git/gitCli.ts`
- `src/git/localGitRepository.ts`

**方案**（遵循 `views → git → domain` 单向分层，分支是 git 能力）：

1. `GitCli.getCurrentBranch()` 由 `private` 改为 `public`（供 `LocalGitRepository.status()` 复用），逻辑不变（`git branch --show-current`）。
2. `GitCli.listBranches(rootPath): Promise<string[]>`——列出本地 + 远端分支供 QuickPick：
   - `git branch --all`，解析输出行。
   - 去除 `remotes/` 前缀后的**去重简名**（`refs/remotes/origin/` 具体看输出格式），`*` 当前标记剔除。
   - **参数数组安全**：分支名是命令输出，不拼进命令行参数（只作为返回值交给上层弹列表），避免 shell 注入。
3. `GitCli.checkout(rootPath, branchName): Promise<void>`——`git checkout <branch>`，分支名以**数组元素**传入 `run(['checkout', branchName])`。
4. `LocalGitRepository`：
   - 新增字段 `currentBranch: string | undefined`。
   - `status()` 中用 `Promise.all` 并行读 status 与 current branch，一起写入 `this.state`（现有结构）**与** `this.currentBranch`（新字段）。
   - 新增 `listBranches(): Promise<string[]>` → 委托 gitCli。
   - 新增 `switchBranch(branchName: string): Promise<void>` → `gitCli.checkout`，成功后由上层（extension.ts）触发 `scheduleStatusRefresh`。

**接口变更**：`GitRepositoryLike` 增加 `currentBranch?: string | undefined`、`listBranches()`、`switchBranch()`。

**验收**：
- [ ] `currentBranch` 在 status 刷新后被填充；detached HEAD / 非 git 仓库为 `undefined`（不抛错）
- [ ] `listBranches` 返回去重后的本地 + 远端分支简名列表
- [ ] `switchBranch` 以 argv 数组传分支名，无 shell 字符串拼接
- [ ] git 层不 import `vscode`（分层红线）

**测试（TDD，`test/unit/gitCli.test.cjs` + localGitRepository 相关）**：
- `checkout` 参数断言：`['-C', root, 'checkout', branch]`，含空格/多字节分支名用例
- `listBranches` 解析本地 + 远端、去重、剔除 `*` 标记
- `status()` 后 `currentBranch` 正确更新
- detached（`branch --show-current` 返回空）时 `currentBranch === undefined`

---

### 任务 2：仓库条目显示当前分支（description 追加）

**改动文件**
- `src/views/repositoryTreeItem.ts`
- `src/views/changedRepositoriesProvider.ts`（状态签名纳入分支）

**方案**：
1. `repositoryTreeItem.ts`：`description` 由 `相对路径` 变为 `相对路径 · 分支名`；`repository.currentBranch` 为空时回退纯路径。`tooltip` 追加分支信息。
2. `changedRepositoriesProvider.ts` 的 `getRepositoryStateSignature()`：把每个仓库的 `currentBranch` 纳入签名，使**外部切分支**也能被对账刷新（`reconcileRepositoryState`）感知，触发视图更新。

**验收**：
- [ ] 渲染出的条目 description 为 `folder · main` 形式
- [ ] 无分支仓库回退纯路径，视图不报错
- [ ] 外部 `git checkout` 切换分支后，对账刷新使 description 自动更新

**测试**：
- `repositoryTreeItem.test.cjs`：description 含 `· 分支`；空分支回退
- provider 测试：`getRepositoryStateSignature` 因分支变化而不同（触发对账）

---

### 任务 3：切换分支命令 + UI 按钮

**改动文件**
- `src/extension.ts`
- `package.json`

**方案**：
1. `src/extension.ts` 注册 `scmRepositoryFilter.switchBranch`：
   - 接收 target 仓库（同现有命令 `resolveRepositoryTarget` 模式）。
   - `showQuickPick` 该仓库的 `listBranches()`（`placeHolder: 'Select a branch to switch to'`）；可用 `title`/`items` 附带说明。
   - 选中后 `withProgress` 执行 `repository.switchBranch(branch)`。
   - 成功：`showInformationMessage(branch 切换完成)` + `repositoriesProvider.scheduleStatusRefresh([repository])`（复用现有刷新，同时刷新两个 Tree View）。
   - 失败：`showErrorMessage(git checkout 报错原文)`——**直接报错，不自动 stash**。
   - 分支列表为空 / 为 undefined 时给出友好提示。
2. `package.json`：
   - `contributes.commands` 注册 `scmRepositoryFilter.switchBranch`，icon 用 `$(git-branch)`。
   - `contributes.menus["view/item/context"]` 添加 `inline` 项，`when` 为 `view == scmRepositoryFilter.changedRepositories && (viewItem == changedRepository || viewItem == pinnedRepository)`。

**验收**：
- [ ] 仓库条目出现"切换分支"内联按钮（`$(git-branch)`），pinned 与 changed 条目都显示
- [ ] 点击按钮弹 QuickPick，列出本地 + 远端分支
- [ ] 选中分支后切换成功、视图刷新、description 更新、出现成功 toast
- [ ] 有未提交改动导致 checkout 失败时，弹错误消息，仓库与改动保持不变
- [ ] 点击仓库条目本身仍走 `selectRepository`（回归，不破坏现有"选中看文件"）

**测试**：
- `extensionManifest.test.cjs`：断言新 command 已注册（`extension.ts` 与 `package.json` 交叉一致，防 docs/注册漂移）
- `package.json` inline 菜单 `when` 同时覆盖 `changedRepository | pinnedRepository`
- `repositoryTreeItem.test.cjs`：`command` 仍为 `selectRepository`（回归），含 `switchBranch` 可从条目解析到仓库

---

### 任务 4：验证与收尾

- [ ] `npm run check`（tsc --noEmit）exit 0
- [ ] `npm test` 全绿（新增用例 > 0）
- [ ] `npm run harness:doctor` 0 errors 0 warnings（`switchBranch` 命令注册与 `wiki/architecture.md` 扩展点登记交叉比对）
- [ ] 真实 git 集成验证：分支显示、本地/远端分支切换、冲突报错、外部切分支同步

**已知限制（此 change 不处理）**：QuickPick 不分页（远端分支多时列表长）；checkout 不自动 stash；打开的 diff 视图内容不强制重载。
