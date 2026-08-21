# Architecture（架构）

## 分层关系图

```
┌──────────────────────────────────────────────────────────┐
│  src/extension.ts    唯一入口：registerCommand / createTreeView │
│                      装配 domain + git + views，接驳事件闭环      │
└──────────────┬───────────────────────┬───────────────────┘
               │ uses                  │ creates / injects
               ▼                       ▼
┌─────────────────────┐   ┌────────────────────────────────┐
│  src/git/           │   │  src/views/                    │
│  CLI 封装 / 解析     │◄──│  TreeDataProvider + TreeItem   │
│  仓库扫描 / blob 读取 │   │  会话选择状态                    │
└──────────┬──────────┘   └──────────────┬─────────────────┘
           │ uses                        │ reads
           ▼                             ▼
┌──────────────────────────────────────────────────────────┐
│  src/domain/   纯模型 + 决策逻辑（无 vscode、无副作用）          │
│  repositoryState / repositoryQueries / repositoryChangeFiles │
│  changeOpenPlan / repositoryViewState / gitGraph            │
└──────────────────────────────────────────────────────────┘
```

## 核心数据流

```
文件/仓库事件（workspace.onDid* / Git 事件）
  └→ extension.ts 更新 domain 状态缓存
        └→ fireTreeDataChanged 通知受影响 Provider
              └→ views/ 把「缓存 → TreeItem」渲染
                    └→ 用户操作（stage/discard/打开 diff）→ src/git 层执行
```

- **重算在事件闭环内**：点击切换仓库优先复用缓存，不在 `getChildren` 里跑 Git。
- **Git 命令只经 `src/git`**；view/domain 不 spawn。
- **长任务背景化**：手动刷新（≤4 并发）、大型工作区先显示扫描结果再后台增量刷新。

## 状态管理边界

| 状态类型 | 位置 | 说明 |
|---|---|---|
| 仓库/变更文件缓存 | `domain/repositoryState.ts` + 各 Provider 持有 | 事件刷新，非每次查询 |
| 视图选择状态 | `views/repositorySelectionState.ts` | 单一真源 |
| 视图可见性 | `domain/repositoryViewState.ts` | 区分环境错误 vs 无改动 |

## 扩展点登记（docs 漂移清单）

> `harness-doctor` 会在 `src/extension.ts` 中找到的 `registerCommand` 与下文逐条比对，缺失即报错。新增命令/视图在此登记。

| 命令 ID | 用途 | views 挂载 |
|---|---|---|
| `scmRepositoryFilter.refresh` | 刷新 Changed Repositories | changedRepositories title |
| `scmRepositoryFilter.selectRepository` | 选中仓库 | changedRepositories item |
| `scmRepositoryFilter.openRepository` | 打开仓库 | changedRepositories item |
| `scmRepositoryFilter.openGitGraph` | 查看 Git Graph | changedRepositories item |
| `scmRepositoryFilter.openChange` | 打开变更 | changedFiles item |
| `scmRepositoryFilter.commitStaged` | 提交已暂存 | changedRepositories item |
| `scmRepositoryFilter.switchBranch` | 切换分支（弹分支列表） | changedRepositories item |
| `scmRepositoryFilter.repositoryMoreActions` | 打开 Stash / Apply Stash 更多操作 | changedRepositories item |
| `scmRepositoryFilter.pull` | Pull | changedRepositories item |
| `scmRepositoryFilter.push` | Push | changedRepositories item |
| `scmRepositoryFilter.stageChange` | Stage 单文件 | changedFiles item |
| `scmRepositoryFilter.unstageChange` | Unstage 单文件 | changedFiles item |
| `scmRepositoryFilter.discardChange` | Discard | changedFiles item |
| `scmRepositoryFilter.stageAllChanges` | Stage All | changedFiles group |
| `scmRepositoryFilter.unstageAllChanges` | Unstage All | changedFiles group |
| `scmRepositoryFilter.pinRepository` | 添加固定仓库 | changedRepositories title |
| `scmRepositoryFilter.manageRepositoryHistory` | 查看、导入或删除全局固定仓库历史 | changedRepositories title |
| `scmRepositoryFilter.unpinRepository` | 移除固定仓库 | changedRepositories item |

**视图（viewsWelcome）**：`scmRepositoryFilter.changedRepositories` / `scmRepositoryFilter.changedFiles`

**配置项**：
- `scmRepositoryFilter.scanMode`（`'pinned'` | `'all'`，默认 `'pinned'`）— `pinned` 只扫描/刷新固定仓库（嵌套仓库多、只关注少数仓库时的性能模式）；`all` 递归扫描工作区全部仓库（兼容旧行为）。
- `scmRepositoryFilter.pinnedRepositories`（`string[]`）— 固定仓库列表，存**相对工作区根的路径**（如 `originSource/acme/address`）。添加命令接受后缀（`acme/address`）做唯一匹配后转存相对路径；固定仓库在两种模式下都常驻显示（pin 图标），撤销后随配置即时重建。
- `ExtensionContext.globalState.pinnedRepositoryHistory`（`string[]`）— 用户级固定仓库历史，存规范化相对路径。Pin 与扩展激活会合并历史；历史管理命令只在用户确认导入时写当前工作区配置，删除历史不影响当前配置。

## 改动边界

- 修改 `domain` 模型 → 影响所有消费方，**强制**跑 `npm run check` 把所有不一致暴露出来。
- 新增 view → 在 `extension.ts` 装配并在本表登记；复用 `domain` 纯逻辑。
- 修改 `src/git` 解析 → 必须同步 `test/unit` 对应用例。

## 避坑指南

- `fireTreeDataChanged` 按仓库粒度触发，不要全量重建整棵树。
- 定时器（每秒对账）必须在 `activate` 返回的 Disposable 中清理。
- 不要依赖内置 Git 扩展的 `Repositories` 列表；扫描基于 `workspaceRepositoryScanner`。
