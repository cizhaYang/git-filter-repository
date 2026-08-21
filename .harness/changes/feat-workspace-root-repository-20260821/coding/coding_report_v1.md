# 编码实现报告 v1

## 改动文件

- `src/views/changedRepositoriesProvider.ts`
  - 增加会话级工作区根仓库集合。
  - `pinned` 模式使用 `scanWorkspaceRoots` 浅扫描，并与手动固定根目录合并。
  - `all` 模式将递归扫描结果中与工作区根完全相同的路径标记为主工程常驻仓库。
  - 可见性合并为「改动 ∪ 手动固定 ∪ 主工程」；主工程排除 Pin/Unpin 语义。
- `src/git/workspaceRepositoryScanner.ts`
  - 区分正常路径缺失与权限/I/O 错误。
  - 工作区根浅扫描按根降级并记录日志，递归扫描的标记读取错误只跳过当前目录。
- `test/unit/changedRepositoriesPinnedMode.test.cjs`
  - 增加根仓库常驻、普通展示、全量扫描漏项/失败、多根工作区和浅扫描失败降级测试。
- `test/unit/workspaceRepositoryScanner.test.cjs`
  - 增加 `.git` 文件、无标记、去重、逐根错误降级及递归局部错误测试。
- `.harness/wiki/architecture.md`
  - 登记工作区根仓库的会话级状态与展示语义。
- `.harness/skills/request-analysis/SKILL.md`
  - 增加需求产物必须位于 `.harness/changes/{change-id}/` 的 Checklist，防止旁路文档路径错误。

## 公共出口

无新增 Provider 公共方法、命令或配置项。主仓库集合为 Provider 内部会话状态。

## 关键决策

- 复用现有 `scanWorkspaceRoots`，避免默认 `pinned` 模式因为主工程常驻而触发昂贵的递归扫描。
- 主工程与手动固定仓库分开维护：前者只影响常驻可见性，后者才决定 Pin 图标和 Unpin 菜单。
- `all` 模式发布递归扫描结果前显式合并主工程与手动固定仓库，扫描漏项或整体失败不能清除常驻项。
- 所有路径先转为规范化绝对路径，再做集合去重和工作区根精确匹配，避免嵌套仓库被误标为主工程。
- 保留扫描代际校验；异步 `all` 扫描完成后只有当前代际才能更新仓库集合。

## 已知限制 / 后续工作

- 测试注入的自定义 scanner 如果不提供 `scanWorkspaceRoots`，无法模拟主工程浅扫描；生产实现始终提供该方法。
- 本次不改变用户已有的 `pinnedRepositories` 配置；若其中包含工作区根路径，运行时仍按自动主工程普通仓库展示。

## 门禁

- `npm run check`：通过。
- `npm run build`：通过。
- `npm test`：通过，120 tests / 120 pass。
- `npm run harness:doctor`：通过，0 errors / 0 warnings。
- `git diff --check`：通过。
