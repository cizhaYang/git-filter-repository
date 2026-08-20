# 修复 scanMode 过期扫描结果

## 背景

用户把 `scmRepositoryFilter.scanMode` 从 `all` 切回 `pinned` 后，Changed Repositories 仍可能显示未配置在 `scmRepositoryFilter.pinnedRepositories` 中的仓库。该行为破坏了 pinned 模式只关注固定仓库的约定。

## 范围（In Scope）

- 修复 scanMode 切换期间异步仓库扫描的竞态。
- 保证进入 `pinned` 模式后，过期的 `all` 模式任务不能覆盖当前仓库集合。
- 增加覆盖 `all -> pinned` 且旧扫描延迟完成的单元测试。

## 非目标（Out of Scope）

- 不改变 `all` 与 `pinned` 两种模式的既有展示规则。
- 不调整仓库扫描算法、Git status 刷新策略或设置项格式。
- 不修改用户已有的 README 变更。

## 核心场景

1. Provider 在 `all` 模式启动后台递归扫描。
2. 扫描完成前，用户把配置切换为 `pinned`。
3. Provider 立即按固定仓库列表重建视图。
4. 旧扫描随后完成，其结果被识别为过期并丢弃，视图仍只包含固定仓库。

## 验收标准

- 延迟的 `all` 扫描在切换到 `pinned` 后完成时，`getChildren()` 只返回固定仓库。
- 现有 `pinned -> all`、固定仓库常驻展示等测试继续通过。
- `npm run check`、`npm test` 和 `npm run harness:doctor` 均退出码为 0，且测试数大于 0。

## 风险与权衡

- 仓库扫描和状态刷新均为异步任务，需要防止旧任务修改新模式状态，同时不能误伤同一模式下正常的后续刷新。
- 修复应限定在 Provider 的异步结果提交边界，避免引入取消底层文件遍历的额外复杂度。
