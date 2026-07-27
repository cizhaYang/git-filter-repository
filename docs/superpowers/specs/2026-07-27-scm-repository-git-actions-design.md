# Changed Repositories Git 操作设计

## 目标

在现有 `Changed Repositories` 仓库树上增加 `Commit Staged`、`Pull` 和 `Push` 操作。仓库节点点击仍然只负责展开和折叠，不跳转目录。

## 交互

- 仓库节点右键菜单提供 `Commit Staged`、`Pull`、`Push`。
- Commit 只允许提交已经进入 Git index 的文件。
- Commit 前检查 `repository.state.indexChanges`：为空时提示没有已暂存文件，不弹出提交框，也不改变未暂存文件。
- 有暂存文件时弹出提交信息输入框；取消输入不执行提交，空白信息提示错误。
- 提交调用 `repository.commit(message, { all: false })`，明确禁止自动暂存未暂存文件。
- Pull 调用当前仓库 API 的 `pull()`，Push 调用 `push()`，均使用当前分支配置的默认远程。
- 操作期间显示 Source Control 进度，操作完成后刷新仓库树和文件树。
- Git API 报错时保留原始错误信息并通过 VS Code 错误提示展示，不吞掉失败状态。

## 架构

继续使用 VS Code 内置 Git 扩展 API，不执行 shell 命令，也不自行读取 `.git`。

- `src/git/gitExtension.ts` 扩展仓库接口，声明 `commit`、`pull`、`push` 方法和提交选项。
- `src/extension.ts` 注册三个命令，负责输入、进度、错误提示和调用仓库 API。
- `src/views/repositoryTreeItem.ts` 保持 `contextValue: changedRepository`，作为菜单匹配条件。
- `package.json` 在 `contributes.commands` 和 `menus.view/item/context` 中暴露仓库操作。
- 当前 `ChangedRepositoriesProvider` 已监听仓库状态事件，操作成功后直接触发已有刷新即可。

## 数据流

1. 用户在仓库节点上下文菜单选择 Git 操作。
2. VS Code 将对应 TreeItem 传给命令，命令解析出 TreeItem 上的 repository。
3. Commit 先读取 index 状态并获取提交信息；Pull/Push 直接使用 repository API。
4. 统一通过 `window.withProgress` 执行操作。
5. 成功显示结果提示并刷新视图；失败显示错误提示并记录到输出通道。

## 测试

- 纯逻辑测试：没有 indexChanges 时 Commit 不可执行，有 indexChanges 时允许提交。
- 清单测试：三个命令已注册，并且上下文菜单只匹配 `changedRepository`。
- API 调用测试：Commit 传递 `{ all: false }`；Pull 和 Push 调用对应仓库方法。
- 回归测试：现有仓库过滤、文件 diff 和仓库标题测试继续通过。
- 手动验证：分别准备仅未暂存、仅已暂存、同时有暂存和未暂存的仓库，确认 Commit 只影响暂存内容；再验证 Pull/Push 的成功和失败提示。

## 非目标

- 本次不增加 stage、unstage、stash、远程选择或分支选择。
- 本次不改变 diff 打开方式。
- 本次不执行自动暂存或自动生成提交信息。
