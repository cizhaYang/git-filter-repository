# Spec: git 层编码规范

> 参考 Harness 的 coding-skill specs 已按本项目（VS Code 扩展）改写。git = Git 能力边界。

## 目标
`src/git/` 是**唯一**允许执行 Git 命令 / 触碰文件系统的层。封装 CLI、输出解析、仓库扫描。

## 归属示例

| 归 git | 不归 git |
|---|---|
| `gitCli.ts`（spawn 封装） | 命令触发逻辑（domain 决策） |
| `gitStatusParser.ts`（纯解析） | 视图渲染（views） |
| workspace 仓库扫描 / blob 文档读取 | 状态缓存（domain） |

## 编码要求

- **命令参数**以数组形式传入 `subprocess`，**禁止**拼进 shell 字符串（防注入）。
- **解析纯函数**：string 输入 → 结构化输出，无 I/O；便于单测。
- **不反向依赖**：git 不 import domain/views；返回的模型类型通过 `import type` 从 domain 复用。
- **并发控制**：批量刷新/扫描设置并发上限（如 4），避免命令拥挤。
- **错误上抛**：Git 非零退出、输出格式异常必须抛显式错误，禁止静默吞。

## 单测配合
- `gitStatusParser` / 扫描路径等纯逻辑在 `test/unit/*.test.cjs` 覆盖。
- 真实 Git 环境差异（换行、locale、中文路径）作为 edge 用例固定。
