# Test Plan

## 变更驱动覆盖

- 被测实现：`src/views/changedRepositoriesProvider.ts`
- 对应测试：`test/unit/changedRepositoriesPinnedMode.test.cjs`

## 用例

- Happy path：既有 `pinned -> all` 用例验证切到 all 后正常全量扫描并展示“改动仓库 ∪ 固定仓库”。
- Edge case：既有空固定列表、无改动仓库、固定仓库零改动等用例保持通过。
- Regression：新增延迟 all 扫描用例，先切到 pinned 并确认只显示固定仓库，再完成旧扫描并再次断言非固定仓库没有出现。
- Regression：新增延迟初始化浅扫描用例，监听每次树刷新，确认 `all -> pinned` 后没有任何一次事件发布非固定仓库。

## TDD 证据

- RED：现有实现下新增用例失败，实际列表为 `['/workspace/pinned', '/workspace/dirty']`，期望仅 `['/workspace/pinned']`。
- GREEN：增加刷新代际校验后目标测试 `9/9` 通过，完整测试 `99/99` 通过。
- 第二轮 RED：初始化浅扫描无提交前守卫时，事件序列出现 `['/workspace/dirty']`。
- 第二轮 GREEN：守卫移到浅扫描 await 后、状态提交前，目标文件 `10/10` 通过。

## 隔离性

- scanner 和 VS Code 配置事件均使用现有测试桩，不执行真实 Git，不启动 Extension Host。
