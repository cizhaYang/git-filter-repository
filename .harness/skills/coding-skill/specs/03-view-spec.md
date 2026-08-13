# Spec: view 层编码规范

> 参考 Harness 的 coding-skill specs 已按本项目（VS Code 扩展）改写。view = 视图与可见状态。

## 目标
`src/views/` 把「状态缓存 → TreeItem」映射给 VS Code 树视图，并持有会话级选择状态。

## 归属示例

| 归 view | 不归 view |
|---|---|
| `TreeDataProvider` / `TreeItem` 构造 | 状态计算（domain） |
| `getChildren` / `getTreeItem` | Git 命令（git） |
| 会话选择状态（repositorySelectionState） | 事件源监听（由 Provider 持有，但可从 git/extension 注入） |

## 编码要求

- **Provider 不跑 Git**：`getChildren` 只读缓存；数据缺失时通过注入的刷新回调触发，返回后 `fireTreeDataChanged`。
- **事件闭环**：文件/git 事件 → 更新 domain 缓存 → 按受影响仓库触发增量刷新。
- **重算在事件闭环内**：不把"全量重扫"放在每次鼠标事件；点击切换仓库时优先复用缓存。
- **用户可见反馈**：加载中 / 空态（welcome view）/ 错误用 `TreeItem` 文案或 `setMessage` 表达，不抛 stack。
- **选择状态单一真源**：收敛到 `repositorySelectionState.ts`，避免多 Provider 各自维护。

## 单测配合
- 纯状态类（如 `repositorySelectionState`）可单测；依赖 vscode 的 Provider 只做薄壳，逻辑下沉可测部分。
