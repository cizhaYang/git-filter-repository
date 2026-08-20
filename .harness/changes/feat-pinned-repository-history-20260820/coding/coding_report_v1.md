# Coding Report v1

## 改动文件

| 文件 | 改动 | 职责 |
|---|---:|---|
| `src/domain/pinnedRepositoryHistory.ts` | 新增 97 行 | 历史未知值过滤、合并、删除和导入匹配计划 |
| `src/extension.ts` | 新增约 218 行 | `globalState` 生命周期、Quick Pick 管理、部分/全部导入和删除交互 |
| `package.json` | 新增 10 行 | 注册 `manageRepositoryHistory` 命令和标题栏按钮 |
| `test/unit/pinnedRepositoryHistory.test.cjs` | 新增 104 行 | 领域逻辑 happy/edge/regression 测试 |
| `test/unit/extensionManifest.test.cjs` | 新增 7 行 | 命令与标题栏入口登记测试 |
| `README.md` | 新增 12 行 | 用户操作说明 |
| `.harness/wiki/architecture.md` | 新增 2 行 | 命令与全局状态扩展点登记 |
| `.harness/wiki/domain-model.md` | 新增 12 行 | 导入计划领域类型登记 |

## 公共出口变化

- 新增命令：`scmRepositoryFilter.manageRepositoryHistory`。
- 新增全局状态键：`pinnedRepositoryHistory`（`string[]`，规范化相对路径）。
- 新增领域类型：`PinnedRepositoryHistoryImportItem` 与状态 union。
- 新增领域纯函数：`normalizePinnedRepositoryHistory`、`mergePinnedRepositoryHistory`、`removePinnedRepositoryHistoryEntry`、`createPinnedRepositoryHistoryImportPlan`。

## 关键决策

- 当前项目仍以 `scmRepositoryFilter.pinnedRepositories` 为真实来源；全局历史只负责跨工作区复用，避免改变既有配置语义。
- 历史保存相对路径而非绝对路径，以支持目录位置不同但结构相似的项目。
- 删除历史只更新 `globalState`，不调用工作区配置更新函数。
- 完整仓库扫描仅在用户打开历史管理时触发，并包在 `withProgress` 中，Provider 渲染路径不新增扫描。
- 导入按真实匹配根判断“已固定”，兼容历史短后缀与当前配置完整相对路径长度不同的情况。
- 不新增 Webview 或样式文件，使用 VS Code 原生 Quick Pick 完成多选、全部添加和单项删除。

## 已知限制

- 历史保存在 VS Code 扩展本机 `globalState`，是否跨设备同步取决于 VS Code 对扩展全局状态的同步能力，本功能不实现独立云同步。
- 多根工作区仍沿用现有 Provider 的相对路径策略，以第一个工作区根作为持久化基准。
- 未匹配历史会保留，供以后结构相似的工作区继续使用。

## 编码门禁

- `npm run check`：通过。
- `npm run harness:doctor`：通过，0 errors / 0 warnings。
- 定向测试：7/7 通过。
