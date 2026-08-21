# 工作区根仓库常驻任务拆解

## Task 1：定义主仓库根目录发现边界

- **目标（Goal）**：复用或扩展工作区根浅扫描能力，明确识别每个自身存在 `.git` 的工作区根目录。
- **输入（Inputs）**：`ChangedRepositoriesProvider` 的工作区根路径、`scanWorkspaceRoots` 返回值和现有文件系统标记判断。
- **输出（Outputs）**：必要的 `src/git/workspaceRepositoryScanner.ts` 类型/实现调整，以及对应扫描器单测。
- **验收（Acceptance）**：单测覆盖 `.git` 目录、`.git` 文件、无 `.git`、多根工作区和路径去重；`npm run check` 通过。
- **依赖（Depends-on）**：无。

## Task 2：Provider 合并隐式主仓库与手动固定仓库

- **目标（Goal）**：在 `pinned` 与 `all` 模式中维护主仓库集合，并让主仓库无改动时也进入可见列表，同时保持普通仓库语义。
- **输入（Inputs）**：浅扫描根仓库、手动固定相对路径、递归扫描结果、仓库状态缓存和扫描代际。
- **输出（Outputs）**：修改 `src/views/changedRepositoriesProvider.ts`；必要时调整 `src/domain/pinnedRepositories.ts` 的纯合并逻辑。
- **验收（Acceptance）**：Provider 单测证明空 Pin、嵌套 Pin、`all` 模式、非 Git 根、多根工作区和模式切换均满足验收标准；主仓库 `contextValue` 不为 pinned。
- **依赖（Depends-on）**：Task 1。

## Task 3：回归测试与 Harness 文档同步

- **目标（Goal）**：补齐行为回归测试并记录架构影响，确保实现符合项目分层和工作流门禁。
- **输入（Inputs）**：Task 1-2 的代码变更、现有 Provider/扫描器测试、`.harness/wiki/architecture.md` 和本 change 目录。
- **输出（Outputs）**：`test/unit/*.test.cjs` 测试变更、`.harness/wiki/architecture.md` 必要更新、`coding/coding_report_v1.md`、评审和 CI 产物、更新 `summary.md`。
- **验收（Acceptance）**：`npm run check`、`npm test`、`npm run harness:doctor`、`git diff --check` 全部退出码为 0；`npm test` 的 `pass > 0`；评审无 MUST FIX。
- **依赖（Depends-on）**：Task 1、Task 2。
