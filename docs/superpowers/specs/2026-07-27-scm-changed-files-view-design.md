# Changed Files 视图设计

## 目标

新增插件自己的 `Changed Files` 视图，与 `Changed Repositories` 共享当前仓库选择状态。`Changed Repositories` 只显示有本地变更的仓库；`Changed Files` 只展示当前选中仓库的变更文件，不再依赖 VS Code 内置 `Changes` 的筛选能力。

## 交互

- 点击仓库名称会选中仓库并刷新 `Changed Files`，不会打开目录；点击仓库箭头仍只负责展开和折叠。
- 默认选择第一个有变更的仓库；当前仓库变干净或关闭后自动切换到下一个有变更的仓库。
- 文件视图按 `Staged Changes`、`Changes`、`Merge Changes`、`Untracked Changes` 分组。
- 文件点击打开已有的 VS Code 原生 diff；未跟踪文件直接打开当前文件。
- 已暂存文件提供 `Unstage`。
- 未暂存和未跟踪文件提供 `Stage`；未暂存文件提供 `Discard`，执行前必须确认。
- 操作完成后刷新仓库列表、文件列表和空状态提示。

## 架构

- `RepositorySelectionState` 保存当前选中的 `GitRepositoryLike`，并通过事件通知两个 TreeDataProvider。
- `ChangedRepositoriesProvider` 只负责仓库节点，不再把文件作为子节点。
- `ChangedFilesProvider` 读取 selection state，为当前仓库创建分组节点和文件节点。
- `repositoryChangeFiles.ts` 扩展 `untrackedChanges`，继续把 Git API 的变更对象统一成文件模型。
- Stage/Unstage/Discard 复用 VS Code 内置 Git API 的 `add`、`revert`、`clean`，不执行 shell 命令。
- `package.json` 新增 `Changed Files` 视图和文件节点上下文菜单。

## 数据流

1. Git 仓库状态或仓库列表发生变化。
2. 仓库 provider 重新计算 dirty 仓库，并修正 selection state。
3. selection state 事件触发文件 provider 刷新。
4. 文件 provider 根据当前仓库状态重建分组和文件节点。
5. 文件操作调用内置 Git API，完成后触发统一刷新。

## 错误与边界

- 没有选中仓库或 Git API 不可用时，文件视图显示空状态。
- 当前仓库没有文件变更时，文件视图显示空状态。
- Discard 取消确认时不执行任何 Git 操作。
- Git API 失败时显示错误提示并写入输出通道，其他仓库仍保持可用。
- 文件路径统一使用 Git API 返回的绝对路径；目录展示使用相对仓库根目录的路径。

## 非目标

- 本次不尝试控制 VS Code 内置 `Changes` 视图的选中仓库或筛选内容。
- 本次不增加远程选择、分支选择、stash 或冲突解决编辑器。
