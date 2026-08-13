# Spec: domain 层编码规范

> 参考 Harness 的 coding-skill specs 已按本项目（VS Code 扩展）改写。domain = 纯模型 + 决策逻辑。

## 目标
`src/domain/` 只放可单测的纯逻辑：**不 import `vscode`、不跑命令、无副作用**。

## 归属示例

| 归 domain | 不归 domain |
|---|---|
| 仓库状态模型 / 变更文件分组 | `TreeDataProvider` / `TreeItem`（views） |
| `gitStatusParser` 的解析逻辑 | Git 命令 spawn（git） |
| 视图可见状态（选中仓库、展开分组） | 文件系统/工作区扫描（git） |

## 编码要求

- **零 vscode 依赖**：如该文件必须触碰 VS Code 类型，拆出纯逻辑部分单测，vscode 部分留薄壳。
- **纯函数优先**：输入 → 输出，无隐式全局；副作用（如刷新触发）通过回调参数注入。
- **类型真源**：模型接口在此定义，其他层 `import type`（见 wiki/domain-model.md）。
- **错误显式**：解析失败抛业务错误，由上层捕获并转用户可见信息。
- **不可变**：派生状态用新对象，不要原地 mutate 缓存。

## 单测配合
- 每个 domain 模块对应 `test/unit/*.test.cjs`，直接 require `dist`.
- 单测覆盖：happy / edge（空、异常输入）/ regression。
