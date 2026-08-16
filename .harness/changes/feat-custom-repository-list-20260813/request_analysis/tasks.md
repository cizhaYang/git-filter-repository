# Tasks: 自定义（固定）仓库列表

## T1 — domain 纯函数：固定仓库解析与合并

- **目标（Goal）**：新增无副作用、可单测纯逻辑：模式→匹配结果，改动∪固定合并，改动数角标。
- **输入（Inputs）**：`src/domain/repositoryQueries.ts`、`src/domain/repositoryState.ts`、`src/git/localGitRepository.ts`。
- **输出（Outputs）**：新建 `src/domain/pinnedRepositories.ts`：
  - `resolvePinnedRepositories(repositoryRoots, patterns): { matched; ambiguous; notFound }`（后缀分段匹配，空白跳过、去重）。
  - `mergeVisibleRepositories<T extends {rootUri:{fsPath:string}}>(changed, pinnedRoots): T[]`（按 fsPath 去重）。
  - `getPinnedRepositoryDetail(state): { changeCount: number }`（角标用 `countRepositoryChanges`）。
- **验收（Acceptance）**：`npm run check` 通过；`npm test` 含用例（T3）。
- **依赖（Depends-on）**：`T3`（先写测试）。

## T2 — 配置定义、包清单、菜单

- **目标（Goal）**：注册 `scanMode` + `pinnedRepositories` 配置、两条命令、action 菜单。
- **输入（Inputs）**：`package.json`。
- **输出（Outputs）**：
  - `contributes.configuration`：`scmRepositoryFilter.scanMode`（enum `['pinned','all']`, default `'pinned'`）、`scmRepositoryFilter.pinnedRepositories`（array of string, default `[]`）。
  - `contributes.commands`：`pinRepository`（title 图标 `$(add)`）、`unpinRepository`。
  - `contributes.menus`：view/title 挂 pin；view/item/context 挂 unpin（`when: viewItem == pinnedRepository`）。
- **验收（Acceptance）**：JSON 可解析；命令字符串与 T5 一致；`extensionManifest.test.cjs` 通过。
- **依赖（Depends-on）**：—

## T3 — domain 纯逻辑单测

- **目标（Goal）**：覆盖 spec 验收 #2 全部断言。
- **输入（Inputs）**：`test/unit/` 风格。
- **输出（Outputs）**：`test/unit/pinnedRepositories.test.cjs`。
- **验收（Acceptance）**：`npm test` 通过且 `pass > 0`。
- **依赖（Depends-on）**：`T1` 编译进 dist。

## T4 — Provider：scanMode=pinned 扫描策略 + 渲染 + pin 图标

- **目标（Goal）**：`ChangedRepositoriesProvider` 支持 `pinned`/`all` 双模式；pinned 模式下只建/刷固定仓库；渲染固定常驻 + pin 图标 + 改动数角标；暴露仓库快照供 add 匹配；监听配置变化即时切换。
- **输入（Inputs）**：`src/views/changedRepositoriesProvider.ts`（扫描/刷新/getChildren/getMessage/事件监听）；`src/views/repositoryTreeItem.ts`（isPinned → `$(pinned)` 图标、`pinnedRepository` contextValue、角标 description）；`src/domain/pinnedRepositories.ts`。
- **输出（Outputs）**：
  - Provider 构造注入 `scanMode` 与 patterns 来源（默认读 `vscode.workspace.getConfiguration`）。
  - `pinned` 模式：`initialize`/`refreshFromGitStatus` 只处理固定仓库；固定列表变化时 `replaceRepositories`（只建固定的）；`getChildren` 渲染固定列表（零改动也显示）；`getMessage` 用空列表空态。
  - `all` 模式：保持现有全量路径 + `mergeVisibleRepositories` 附加固定。
  - 暴露 `getAllRepositoryRoots(): readonly string[]` 或等价只读仓库快照。
  - `onDidChangeConfiguration`：`pinnedRepositories` → 重解析+重扫最近一次 refresh；`scanMode` → 切换策略重建。
- **验收（Acceptance）**：`npm run check` 通过；pinned 模式 getChildren 不触发全量扫描路径（用 injected scanner 断言只调用固定根）；无新增泄漏定时器。
- **依赖（Depends-on）**：`T1`、`T2`。

## T5 — extension 装配 add/remove + 扫描模式装配

- **目标（Goal）**：注册 `pinRepository`、`unpinRepository`；装配 scanMode。
- **输入（Inputs）**：`src/extension.ts`；`src/domain/pinnedRepositories.ts`；`src/views/changedRepositoriesProvider.ts`；现有 `refreshRepositories`/scanner 装配。
- **输出（Outputs）**：
  - `pinRepository`：输入 → 用 provider 仓库快照（不足时一次性浅扫拿候选 roots）→ 后缀匹配 → 唯一写配置 / 多选 QuickPick 写相对路径 / 0 命中报错。
  - `unpinRepository`：从 target 移除对应模式写回配置。
  - 两命令都 `config.update('pinnedRepositories', next, Global)`，触发 T4 监听刷新。
  - scanMode 从配置读取并传入 provider；无额外全量扫描启动。
- **验收（Acceptance）**：`npm run check` 通过；`npm run harness:doctor` 通过；命令字符串与 `package.json` 一致。
- **依赖（Depends-on）**：`T2`、`T4`。

## T6 — provider 行为单测（模式切换 / 渲染）

- **目标（Goal）**：覆盖 spec 验收 #5。
- **输入（Inputs）**：`test/unit/changedRepositories*.test.cjs`（现有 provider 测试文件扩展）。
- **输出（Outputs）**：新增/扩展用例：pinned 模式 getChildren 只返回固定、零改动也渲染、不触发全量扫；all 模式返回改动∪固定；固定条目 isPinned 标记。
- **验收（Acceptance）**：`npm test` 通过且 `pass > 0`。
- **依赖（Depends-on）**：`T4` 编译进 dist。

## T7 — 文档与 docs 漂移登记

- **目标（Goal）**：登记命令/配置到架构文档。
- **输入（Inputs）**：`.harness/wiki/architecture.md`。
- **输出（Outputs）**：扩展点登记追加 `pinRepository`（changedRepositories title）、`unpinRepository`（changedRepositories item）；`scanMode` + `pinnedRepositories` 配置说明。
- **验收（Acceptance）**：`npm run harness:doctor` 退出码 0。
- **依赖（Depends-on）**：`T2`、`T4`、`T5`。

## T8 — 全量质量门禁 + step2 报告

- **目标（Goal）**：跑完整门禁，产出 coding_report。
- **输入（Inputs）**：`npm run check`、`npm test`、`npm run harness:doctor`。
- **输出（Outputs）**：`coding/coding_report_v1.md`（改动文件、关键决策、验收对照）。
- **验收（Acceptance）**：三命令退出码全 0；`npm test` `pass > 0`。
- **依赖（Depends-on）**：`T4`、`T5`、`T6`、`T7`。
