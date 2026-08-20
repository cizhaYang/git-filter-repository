# Code Review v1

- Mode：execution / test
- Verdict：REVISION REQUIRED

## [MUST FIX] 初始化浅扫描绕过代际校验

- 位置：`src/views/changedRepositoriesProvider.ts` 的 `initialize()` / `scanWorkspaceRoots()`
- 问题：初始化浅扫描等待期间发生 `all -> pinned` 后，旧结果仍会先写回仓库集合，短暂发布非固定仓库，再被 pinned 刷新纠正。
- 建议：让初始化浅扫描共享刷新代际，并在任何 `replaceRepositories()` 前校验；增加监听树事件序列的延迟浅扫描回归测试。

## 其余检查

- 递归扫描代际策略、配置切换 watcher 生命周期、现有测试均无其它阻塞问题。
