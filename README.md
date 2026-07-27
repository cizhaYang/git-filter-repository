# SCM Repository Filter

VS Code 插件：在 Source Control 侧边栏新增 `Changed Repositories` 和 `Changed Files` 视图，分别用于筛选改动仓库和查看当前仓库的改动文件。

## 第一版能力

- 读取 VS Code 内置 Git 扩展识别到的仓库。
- 过滤掉没有本地修改的仓库。
- `Changed Repositories` 只显示改动仓库，点击仓库名称会选中仓库但不会跳转目录。
- `Changed Files` 展示当前选中仓库的 Staged、Changes、Merge Changes 和 Untracked Changes。
- 点击文件节点打开 VS Code 原生 diff，查看代码改动点。
- 文件节点支持 Stage、Unstage；工作区和未跟踪文件支持 Discard，Discard 前会确认。
- 仓库状态变化、仓库打开/关闭时自动刷新。
- 支持手动刷新命令：`Refresh Changed Repositories`。
- 仓库节点箭头只负责展开/折叠，不再默认跳转目录。
- 仓库节点支持 `Commit Staged`、`Pull`、`Push` 操作。
- `Commit Staged` 只提交已经暂存的文件，不会自动暂存未暂存文件。
- `Pull` 和 `Push` 使用当前分支配置的默认远程。

## Git 操作

在 `Changed Repositories` 中右键仓库节点，或使用节点旁的操作图标：

- `Commit Staged`：必须先在 VS Code Source Control 中暂存文件，再输入提交信息。
- `Pull`：拉取当前分支默认远程。
- `Push`：推送当前分支默认远程。

操作完成后视图会自动刷新；失败信息会显示在 VS Code 提示中，并记录到 `SCM Repository Filter` 输出通道。

在 `Changed Files` 中选择文件后，可以使用文件节点旁的操作图标执行 Stage、Unstage 或 Discard。Discard 会丢弃未提交修改，执行前需要确认。

## 开发验证

```bash
npm run check
npm run build
npm test
```

调试时在 VS Code 中打开本仓库，按 `F5` 启动 Extension Development Host，然后打开包含多个 Git 仓库的工作区，在 Source Control 侧边栏查看 `Changed Repositories` 和 `Changed Files`。

手动验证 Commit 时，可以准备一个已暂存文件和一个仅修改但未暂存的文件，执行 `Commit Staged` 后检查提交内容，确认只有已暂存文件进入提交。
