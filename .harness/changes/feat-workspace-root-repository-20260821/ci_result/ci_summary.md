# CI 验证摘要

执行日期：2026-08-21

## 结果

| 命令 | 退出码 | 摘要 |
|---|---:|---|
| `npm run check` | 0 | TypeScript strict 类型检查通过 |
| `npm run build` | 0 | esbuild 成功生成 dist |
| `npm test` | 0 | 120 tests，120 pass，0 fail，0 todo |
| `npm run harness:doctor` | 0 | 0 errors，0 warnings |
| `git diff --check` | 0 | 无空白格式错误 |

## 覆盖结论

- 工作区根 `.git` 目录、`.git` 文件、无标记、多根工作区与路径去重均有扫描器单测。
- `pinned`、`all`、模式切换、递归扫描漏项/失败和浅扫描失败降级均有 Provider 回归测试。
- 根仓库的普通仓库语义与手动固定仓库的 Pin/Unpin 语义已分别断言。

## 残余风险

当前项目没有 Extension Development Host 自动化测试框架，因此未自动验证 VS Code 侧边栏中的实际视觉呈现。仓库集合、上下文值、模式切换和错误降级等行为已由单元测试覆盖。
