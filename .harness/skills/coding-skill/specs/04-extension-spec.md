# Spec: extension 装配层编码规范

> 参考 Harness 的 coding-skill specs 已按本项目（VS Code 扩展）改写。extension = 唯一入口装配。

## 目标
`src/extension.ts` 是**唯一**允许同时依赖 `domain / git / views` 三层的装配点。

## 归属示例

| 归 extension | 不归 extension |
|---|---|
| `registerCommand` / `createTreeView` | Provider 内部逻辑（views） |
| Provider 实例化与依赖注入 | Git 命令（git） |
| 订阅文件/仓库事件并接驳缓存对账 | 业务模型（domain） |
| 资源释放（dispose）/ 定时器清理 | — |

## 编码要求

- **命令注册**：`registerCommand` 的字符串与 `package.json` `contributes.commands[].command` 完全一致。
- **依赖注入**：把 Git 能力、状态缓存、查询回调注入 Provider；Provider 不自行 `require('child_process')`。
- **事件接驳**：`workspace.onDidCreateFiles` / `onDidSaveTextDocument` 等 → 更新 domain 缓存 → 触发受影响的 Provider 刷新。
- **生命周期**：`activate` 返回的 `Disposable[]` 必须包含定时器/事件订阅清理，避免扩展卸载泄漏。
- **长任务背景化**：手动刷新等耗时操作用 `withProgress` + 并发上限，不阻塞 UI 线程。

## 校验
- `package.json` contributes 与 `extension.ts` 交叉比对（见 code-review Skill）。
- 新增能力必须登记到 `wiki/architecture.md` 的「docs 漂移清单」。
