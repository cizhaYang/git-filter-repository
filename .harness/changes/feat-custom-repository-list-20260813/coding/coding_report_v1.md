# Coding Report v1 — feat-custom-repository-list-20260813

## 改动文件列表

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/domain/pinnedRepositories.ts` | 新增 | 纯函数：后缀匹配、改动∪固定合并去重、相对路径解析、角标计数 |
| `test/unit/pinnedRepositories.test.cjs` | 新增 | domain 纯函数单测（9 例，全过） |
| `src/views/changedRepositoriesProvider.ts` | 修改 | 双扫描模式、pinned 模式免全量扫描、配置监听、pin 渲染、仓库快照与相对路径 |
| `src/views/repositoryTreeItem.ts` | 修改 | `isPinned` → `$(pinned)` 图标 + `pinnedRepository` contextValue |
| `src/extension.ts` | 修改 | 注册 `pinRepository` / `unpinRepository`，输入→匹配→写配置 |
| `package.json` | 修改 | `scanMode` + `pinnedRepositories` 配置、两条命令、菜单 |
| `test/unit/changedRepositoriesPinnedMode.test.cjs` | 新增 | provider pinned/all 模式行为单测（3 例，全过） |
| `test/unit/changedRepositoriesWorkspaceProvider.test.cjs` | 修改 | vscode stub 补 `getConfiguration`/`onDidChangeConfiguration`，显式 `scanMode:'all'` 保持原语义 |
| `test/unit/changedRepositoriesRefreshScheduler.test.cjs` | 修改 | 同上 stub 修补 |
| `.harness/wiki/architecture.md` | 修改 | 扩展点登记两条命令 + 配置说明 |

## 新增/删除公共出口

- 命令：`scmRepositoryFilter.pinRepository`、`scmRepositoryFilter.unpinRepository`
- Provider 公共方法：`discoverRepositoryRoots()`（添加时一次性扫描候选）、`isPinnedRoot()`、`toWorkspaceRelative()`、`getVisibleRepositories()`
- domain 出口：`resolvePinnedRepositories`、`mergeVisibleRepositories`、`resolvePinnedRootsFromRelative`、`getPinnedRepositoryDetail`、`matchPinnedPattern`、`normalizePinnedPattern`

## 关键决策记录

1. **存储单位 = 相对工作区根的路径**（如 `originSource/acme/address`），而非输入后缀（`acme/address`）。
   - 为什么：spec 曾写"存模式后缀"。但若存后缀 `acme/address`，pinned 模式每次刷新都要重新扫描全工作区才能把后缀匹配到真实路径——这恰恰是用户要避免的性能痛点。
   - 替代方案：添加操作时用后缀唯一匹配一次，然后**把解析后的相对路径持久化**；日常刷新只需 `workspaceRoot + 相对路径` 拼接，**零扫描**。已确认满足"只关注固定仓库、其他不扫"的核心诉求。
   - 代价：跨工作区移动后相对路径可能失配（可接受的已知限制，重新添加即可）。

2. **pinned 模式完全绕过 scanner.scan**：`refreshPinnedRepositories()` 直接按相对路径建仓库对象，不触发全量递归扫描；`discoverRepositoryRoots()` 只被「添加固定仓库」命令调用做一次浅扫描。

3. **`all` 模式沿用既有全量路径**：`mergeVisibleRepositories` 把"改动 ∪ 固定"合并，固定条目带 pin 标记——兼容旧行为。

4. **事件监听差异化**：`all` 模式保留工作区级 create/delete 监听（感知新嵌套仓库）；`pinned` 模式去掉该监听，只靠 `onDidChangeConfiguration` 在固定列表变化时重建，避免不必要的全量重扫。

5. **配置变化即时生效**：`handleConfigurationChange` 监听 `onDidChangeConfiguration`，`scanMode` 或 `pinnedRepositories` 变化即重新 `refreshRepositories()`（pinned 下仍是零扫描重建）。

6. **角标 vs 自动展开**：按确认，固定仓库常驻显示 + 改动数角标（通过 `RepositoryTreeItem` 的 description/tooltip 已有的 `changeCount` 体现，未强行改交互），不自动展开文件列表。

## 质量门禁结果（最终）

- `npm run check`（tsc --noEmit）→ **exit 0** ✅
- `npm test`（node --test）→ **65 / 65 pass** ✅
- `npm run harness:doctor` → **0 errors, 0 warnings** ✅

## 授权补丁：activationEvents（用户已确认）

`test/unit/extensionManifest.test.cjs` 第 58 行断言 `manifest.activationEvents.includes(...)`，但 `package.json` 历史无此字段（`git stash` 验证干净 HEAD 同样失败，属既有 manifest 漂移，与本 feature 无关）。

经 **HITL 用户确认**，授权在本 change 顺手补 `activationEvents`：`["onView:scmRepositoryFilter.changedRepositories", "onView:scmRepositoryFilter.changedFiles"]`。补后 `npm test` 65/65 全绿。该字段本就是 VS Code 视图激活所需，非临时 hack。

## 已知限制 / 后续

- 相对路径持久化跨工作区失配需重新添加。
- `mergeVisibleRepositories` 目前依赖调用方传入全量仓库对象再筛，性能 O(n)；pinned 模式 `getVisibleRepositories` 直接返回固定集合 O(固定数)。
