# 固定仓库历史任务拆解

## Task 1：全局历史与导入计划领域逻辑

- **目标（Goal）**：提供不依赖 VS Code 的历史规范化、合并、删除和仓库匹配规划能力。
- **输入（Inputs）**：未知类型的全局历史值、当前工作区固定路径、发现的仓库绝对路径。
- **输出（Outputs）**：`src/domain/pinnedRepositoryHistory.ts` 及对应 `test/unit/pinnedRepositoryHistory.test.cjs`。
- **验收（Acceptance）**：定向测试覆盖过滤、稳定去重、只删历史、唯一/歧义/未匹配/已固定分类，并全部通过。
- **依赖（Depends-on）**：无。

## Task 2：历史管理命令与状态接入

- **目标（Goal）**：把全局历史生命周期接入扩展激活和 Pin 命令，并实现列表、多选、全部导入与单条删除。
- **输入（Inputs）**：Task 1 纯函数、`context.globalState`、`ChangedRepositoriesProvider.discoverAllRepositoryRoots()`、现有工作区配置更新函数。
- **输出（Outputs）**：修改 `src/extension.ts`；新增命令 `scmRepositoryFilter.manageRepositoryHistory` 的运行时实现。
- **验收（Acceptance）**：类型检查通过；无历史不触发扫描；导入只在最终选择后一次性更新工作区配置；删除全局历史不调用工作区配置更新。
- **依赖（Depends-on）**：Task 1。

## Task 3：Manifest 和 Harness 架构登记

- **目标（Goal）**：让用户可从 Changed Repositories 标题栏进入历史管理，并保证命令登记一致。
- **输入（Inputs）**：历史管理命令 ID 和 VS Code `view/title` 菜单结构。
- **输出（Outputs）**：修改 `package.json`、`test/unit/extensionManifest.test.cjs`、`.harness/wiki/architecture.md`。
- **验收（Acceptance）**：manifest 测试断言命令存在且挂载目标视图；`npm run harness:doctor` 不报告命令文档漂移。
- **依赖（Depends-on）**：Task 2。

## Task 4：用户文档与回归测试

- **目标（Goal）**：说明跨工作区历史的使用方式并完成完整质量门禁。
- **输入（Inputs）**：已完成的实际交互行为和现有 README 固定仓库章节。
- **输出（Outputs）**：在用户已有修改基础上补充 `README.md`；生成 Harness 测试计划、CI 结果及阶段报告。
- **验收（Acceptance）**：`npm run check`、`npm run build`、`npm test`、`npm run harness:doctor` 全部退出码 0，测试通过数大于 0；`git diff` 不包含 `docs/` 下新增需求文档。
- **依赖（Depends-on）**：Task 1、Task 2、Task 3。
