# 测试评审 v1

- **mode**: test
- **verdict**: APPROVED

## 评审范围

- 规格依据：`request_analysis/spec.md`、`request_analysis/tasks.md`。
- 测试对象：`test/unit/changedRepositoriesPinnedMode.test.cjs`、`test/unit/workspaceRepositoryScanner.test.cjs`。
- 未使用编码报告或既有代码评审作为自评依据。

## 覆盖核对

- **改动文件与测试映射**：`src/views/changedRepositoriesProvider.ts` 的根仓库合并、普通/Pin 语义、`pinned`/`all` 模式、递归扫描失败、非 Git 多根工作区和旧代际竞态均在 `changedRepositoriesPinnedMode.test.cjs` 有对应行为用例；`src/git/workspaceRepositoryScanner.ts` 的 `.git` 目录、`.git` 文件、缺失标记、去重、最大深度和逐目录失败降级均在 `workspaceRepositoryScanner.test.cjs` 有对应断言。
- **行为视角**：Provider 用 `getChildren()`、`contextValue`、`isPinnedRoot()`、空态消息和扫描调用次数断言最终可见集合与语义，没有断言私有实现细节；scanner 断言规范化路径、日志和结果集合，没有依赖真实 Git 命令。
- **依赖替换**：Provider 测试通过注入 `scanner`、`repositoryFactory` 和选择状态替身隔离仓库状态；scanner 测试通过注入 `fileSystem`、`logger` 覆盖权限失败等边界。VS Code 模块替身仅在加载被测模块期间安装并在 `finally` 恢复，测试用例之间不保留全局监听状态。
- **独立可重跑**：定向命令 `node --test test/unit/changedRepositoriesPinnedMode.test.cjs test/unit/workspaceRepositoryScanner.test.cjs` 通过（25/25）；全量 `npm test` 通过（120/120）；`node --test test/unit/*.test.cjs` 通过（120/120）。

## 评审意见

### [INFO] `node --test test/unit` 的 Node 22 目录解析差异

- **位置**：项目测试命令/评审检查项，`node --test test/unit`。
- **问题**：当前 Node v22.14.0 将 `test/unit` 目录作为模块路径解析，该命令退出 1；同一环境下展开 glob 的等价命令和项目 `npm test` 均通过。这是 Node CLI 对目录参数的行为差异，不是本次两个测试文件的失败。
- **建议**：CI 或文档使用 `node --test test/unit/*.test.cjs`（或继续使用已通过的 `npm test`），避免把目录参数作为可执行测试入口。
- **分级**：`INFO`

无 `MUST FIX`、`SHOULD` 或 `LOW` 问题。现有测试对本次规格验收场景具备可重跑的行为覆盖，故结论为 `APPROVED`。
