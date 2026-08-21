# CI 验证摘要

## 结果

| 命令 | 退出码 | 摘要 |
|---|---:|---|
| `npm run check` | 0 | TypeScript strict 检查通过 |
| `npm run build` | 0 | esbuild 成功生成 dist |
| `npm test` | 0 | 110 tests，110 pass，0 fail |
| `npm run harness:doctor` | 0 | 0 errors，0 warnings，新命令已登记 |
| `git diff --check` | 0 | 无空白错误 |

## 补充验证

在 `/tmp` 创建临时 Git 仓库，使用包含中文、冒号和 `$PATH` 的 message 创建 stash；真实 `git stash list --format=%gd%x00%gs%x00` 输出已由新 `GitCli.listStashes()` 正确解析为 `ref + description`。临时仓库验证后已删除。

## 残余风险

VS Code Tree View 的 ellipsis 按钮和 Quick Pick 交互需要在 Extension Development Host 中进行人工视觉/点击验证；当前项目没有 Extension Host 自动化测试框架。manifest、命令注册、Git argv、状态判断和解析边界已由单测覆盖。

后续根据视觉反馈，为 ellipsis 菜单项增加 `inline@999` 显式排序权重，避免仅依赖 manifest 数组顺序；manifest 单测断言该权重高于其他仓库行内操作。
