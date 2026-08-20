# Tasks

## Task 1：复现异步扫描竞态

- 目标（Goal）：用单元测试稳定复现 `all -> pinned` 后旧扫描覆盖固定列表的问题。
- 输入（Inputs）：`ChangedRepositoriesProvider`、可控延迟的 scanner、配置变更 stub。
- 输出（Outputs）：`test/unit/changedRepositoriesPinnedMode.test.cjs` 新增回归用例。
- 验收（Acceptance）：现有实现上目标测试因出现非固定仓库而失败。
- 依赖（Depends-on）：无。

## Task 2：阻止过期扫描结果提交

- 目标（Goal）：模式切换后丢弃旧扫描任务的结果。
- 输入（Inputs）：Task 1 的失败用例、Provider 当前模式与异步刷新流程。
- 输出（Outputs）：`src/views/changedRepositoriesProvider.ts` 最小修复和编码报告。
- 验收（Acceptance）：目标测试转绿且 `npm run check` 通过。
- 依赖（Depends-on）：Task 1。

## Task 3：评审与全量验证

- 目标（Goal）：确认修复没有破坏现有刷新、扫描与 watcher 生命周期。
- 输入（Inputs）：代码 diff、完整测试集、Harness 规则。
- 输出（Outputs）：代码评审、测试计划、CI 摘要和变更总结。
- 验收（Acceptance）：`npm run check`、`npm test`、`npm run harness:doctor` 全部通过，无 MUST FIX。
- 依赖（Depends-on）：Task 2。
