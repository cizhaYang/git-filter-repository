# Stash 仓库操作任务拆解

## Task 1：Git Stash 能力与结构化列表

- **目标（Goal）**：在 Git 边界内提供创建 stash、列出 stash 和 apply 指定 stash 的可测试 API。
- **输入（Inputs）**：仓库根路径、stash message、stash ref，以及 Git `stash list` 的 NUL 分隔输出。
- **输出（Outputs）**：修改 `src/git/gitCli.ts`、`src/git/localGitRepository.ts`，并在 `test/unit/gitCli.test.cjs` 补充单测。
- **验收（Acceptance）**：单测断言 `stash push -m`、`stash list --format=...`、`stash apply <ref>` 的 argv 精确一致；列表解析覆盖空列表、特殊字符和多条记录；不出现 untracked 选项。
- **依赖（Depends-on）**：无。

## Task 2：Stash 领域边界

- **目标（Goal）**：定义可 stash 的已跟踪改动判断，避免只有 untracked 文件时给出误导性成功提示。
- **输入（Inputs）**：`GitRepositoryLike.state` 中的 index、working tree、merge 和 untracked 改动集合。
- **输出（Outputs）**：在 `src/domain/repositoryActions.ts` 增加纯判断函数，修改 `test/unit/repositoryActions.test.cjs`。
- **验收（Acceptance）**：单测覆盖 staged、tracked working tree、merge 改动可 stash，只有 untracked 不可 stash，且不依赖 VS Code API。
- **依赖（Depends-on）**：无。

## Task 3：更多按钮与 Stash 交互编排

- **目标（Goal）**：在仓库行最右侧提供 `...` 入口，完成 message 输入、stash 列表选择、进度、错误和刷新闭环。
- **输入（Inputs）**：仓库 TreeItem 或仓库对象、Task 1 的 repository stash API、Task 2 的已跟踪改动判断。
- **输出（Outputs）**：修改 `src/extension.ts`、`package.json`、`test/unit/extensionManifest.test.cjs`，必要时补充不依赖 VS Code 的交互决策测试。
- **验收（Acceptance）**：manifest 单测证明 ellipsis 按钮同时匹配两类仓库且位于其他 inline 操作之后；类型检查证明命令注册与仓库 API 完整；代码路径确保取消时无 Git 调用，Apply 失败也调度状态刷新。
- **依赖（Depends-on）**：Task 1、Task 2。

## Task 4：文档登记与全量验证

- **目标（Goal）**：保持扩展点文档与实际命令一致，并通过项目全部质量门禁。
- **输入（Inputs）**：Task 1-3 的代码和测试改动，现有 `.harness/wiki/architecture.md` 扩展点清单。
- **输出（Outputs）**：更新 `.harness/wiki/architecture.md`、本 change 的 coding/review/unit_test/ci_result 阶段报告及 `summary.md`。
- **验收（Acceptance）**：`npm run check`、`npm test`、`npm run harness:doctor` 和 `git diff --check` 全部通过，`npm test` 的 pass 数大于 0，评审无 MUST FIX。
- **依赖（Depends-on）**：Task 1、Task 2、Task 3。
