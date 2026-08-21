# 工作区根仓库常驻测试计划

## 改动与测试映射

| 改动文件 | 测试文件/验证 | 覆盖方式 |
|---|---|---|
| `src/git/workspaceRepositoryScanner.ts` | `test/unit/workspaceRepositoryScanner.test.cjs` | 直接测试浅扫描、去重和逐目录错误降级 |
| `src/views/changedRepositoriesProvider.ts` | `test/unit/changedRepositoriesPinnedMode.test.cjs` | 通过 scanner 与 repository factory 注入验证 Provider 行为 |
| `.harness/wiki/architecture.md` | `npm run harness:doctor` | 校验架构文档和扩展点登记无漂移 |
| `.harness/skills/request-analysis/SKILL.md` | `npm run harness:doctor` | 校验 Skill frontmatter 与 Harness 结构有效 |

## Happy Path

1. `pinned` 模式在无手动固定项时仍显示干净的工作区根仓库，并保持普通仓库语义。
2. 工作区根仓库与固定的嵌套仓库同时显示，只有嵌套仓库具有 Pin/Unpin 语义。
3. `all` 模式同时显示干净主仓库和有改动的嵌套仓库，隐藏干净且未固定的嵌套仓库。
4. 浅扫描同时识别 `.git` 目录和 `.git` 文件。

## Edge Case

1. 多根工作区只保留自身存在 `.git` 标记的根目录，并对重复路径去重。
2. 单个工作区根无权限时记录日志并继续扫描其余根目录。
3. 递归扫描读取某目录 `.git` 标记失败时只跳过当前目录，不阻断其他仓库发现。
4. 根仓库浅扫描失败时仍保留可解析的手动固定仓库。

## Regression

1. 递归扫描漏掉主仓库或固定仓库时，`all` 模式仍合并常驻集合，避免扫描结果覆盖已知仓库。
2. 递归扫描整体失败时，主仓库和固定仓库仍保持可见。
3. 从 `all` 切回 `pinned` 时忽略旧代际异步结果，避免过期仓库重新写回列表。
4. 用户旧配置包含工作区根 `.` 时，根仓库仍为普通仓库且不能执行 Unpin。

## 测试边界

- 不执行真实 Git 命令；Provider 用例通过依赖注入提供 scanner 和 repository factory。
- 不启动 Extension Development Host；验证 Provider 可见集合、TreeItem 语义、扫描调用和日志等可独立重跑行为。
- 文件系统扫描器只在临时目录中验证 `.git` 文件/目录；权限错误使用注入的文件系统接口模拟。

## CI 门禁

```bash
npm run check
npm run build
npm test
npm run harness:doctor
git diff --check
```

所有命令必须退出码为 0，且 `npm test` 的通过用例数必须大于 0。
