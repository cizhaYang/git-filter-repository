# SCM Repository Filter

VS Code 插件：在 Source Control 侧边栏新增 `Changed Repositories` 和 `Changed Files` 视图，分别用于筛选改动仓库和查看当前仓库的改动文件。

## 当前能力

- 扫描当前 VS Code 工作区根目录及嵌套目录中的 Git 仓库，不依赖内置 Git 扩展的 `Repositories` 列表。
- 过滤掉没有本地修改的仓库。
- `Changed Repositories` 只显示改动仓库，点击仓库名称会选中仓库但不会跳转目录。
- `Changed Files` 展示当前选中仓库的 Staged、Changes、Merge Changes 和 Untracked Changes。
- 即使没有工作区文件，`Changes` 分组也会保留显示，数量显示为 `0`。
- 点击文件节点打开 VS Code 原生 diff，查看代码改动点。
- 文件节点支持 Stage、Unstage；工作区和未跟踪文件支持 Discard，Discard 前会确认。
- `Changes` 分组支持一次性暂存所有工作区修改和未跟踪文件。
- `Staged Changes` 分组支持一次性取消暂存所有已暂存文件。
- 监听工作区和仓库文件的保存、创建、删除、重命名事件，实时刷新改动仓库列表。
- 每秒对账一次本地 Git 状态缓存；文件变化时通过 Git CLI 刷新对应仓库状态。
- 支持手动刷新命令和 `Changed Repositories` 标题栏刷新按钮；刷新时会主动执行 Git status。
- 多仓库手动刷新最多并发执行 4 个 Git status，避免大型工作区出现命令拥挤或取消。
- 超过 32 个仓库的大型工作区会先显示扫描到的仓库，再后台增量刷新 Git 状态，不会阻塞视图初始化。
- 仓库节点箭头只负责展开/折叠，不再默认跳转目录。
- `Changed Files` 下方提供 `Commit staged changes` 和 `Push to remote` 操作入口。
- 提交入口使用 VS Code 原生输入框填写 commit message。
- `Changed Repositories` 仓库节点支持 `Commit Staged`、`Pull`、`Push` 操作。
- 仓库节点支持 `View Git Graph`，可直接查看该仓库的提交历史、分支和合并记录。
- `Commit Staged` 只提交已经暂存的文件，不会自动暂存未暂存文件。
- `Pull` 和 `Push` 使用当前分支配置的默认远程。
- Stage、Unstage 成功后不显示提示；操作失败时显示错误提示并记录日志。

## Git 操作

在 `Changed Repositories` 中右键仓库节点，或使用仓库节点旁的操作图标：

- `Commit Staged`：必须先暂存文件，再输入提交信息；提交只包含 Git index 中的文件。
- `Pull`：拉取当前分支默认远程。
- `Push`：推送当前分支默认远程。
- `View Git Graph`：打开右键选中的仓库历史。该功能需要预先安装并启用 [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) 扩展；多仓库工作区中会将选中仓库作为 Git Graph 的目标。

操作完成后视图会自动刷新；失败信息会显示在 VS Code 提示中，并记录到 `SCM Repository Filter` 输出通道。

在 `Changed Files` 中：

- 点击 `Commit staged changes`，在原生输入框中填写 message 后提交当前仓库的已暂存文件。
- 点击 `Push to remote`，推送当前分支到默认远程。
- 文件节点旁可以执行 Stage、Unstage 或 Discard。
- `Changes` 分组标题旁可以暂存全部未暂存文件；`Staged Changes` 分组标题旁可以取消暂存全部文件。
- Discard 会丢弃未提交修改，执行前需要确认。

## 安装到普通 VS Code

`F5` 只会启动临时的 Extension Development Host。要在普通 VS Code 中使用，先在项目目录执行：

```bash
npm install
npm run check
npm test
npm run package
```

命令会生成 `scm-repository-filter-0.2.0.vsix`。在普通 VS Code 中打开扩展面板，点击右上角 `...`，选择 **Install from VSIX...**，然后选择这个 `.vsix` 文件。安装完成后执行 **Developer: Reload Window**。

也可以使用命令行安装：

```bash
code --install-extension scm-repository-filter-0.2.0.vsix
```

后续代码更新后，重新执行 `npm run package`，再安装新的 VSIX 即可。使用前请确认本机可以执行 `git` 命令。

## 仓库检测范围

插件从 VS Code 当前工作区的根目录开始扫描，不会扫描整个磁盘，也不会改变原生 Source Control 的 `Repositories` 列表。

扫描规则如下：

- 扫描单根或多根工作区，以及工作区内嵌套的 Git 仓库。
- 即使工作区根目录本身是 Git 仓库，也会继续扫描其中的其他嵌套仓库。
- 默认最大扫描深度为 10。
- 跳过 `.git`、`node_modules`、`dist`、`out` 和 `.vscode` 目录。
- 同时识别 `.git` 目录和 `.git` 文件，兼容普通仓库、子模块和 worktree。
- 没有打开工作区时不会执行扫描。

状态和操作通过本机 Git CLI 执行：`status` 使用 `--porcelain=v1 -z`，暂存、取消暂存、丢弃、提交、拉取、推送和历史 diff 都不依赖 VS Code Git API。Git 未安装或单个仓库执行失败时，插件会在 `SCM Repository Filter` 输出通道记录错误，并继续处理其他仓库。

插件激活后会在 `SCM Repository Filter` 输出通道记录扫描到的仓库数量、文件事件命中的仓库和 status 刷新过程，便于排查检测范围与刷新问题。

## 开发验证

```bash
npm run check
npm run build
npm test
```

调试时在 VS Code 中打开本仓库，按 `F5` 启动 Extension Development Host，然后打开包含多个 Git 仓库的工作区，在 Source Control 侧边栏查看 `Changed Repositories` 和 `Changed Files`。

手动验证 Commit 时，可以准备一个已暂存文件和一个仅修改但未暂存的文件，执行 `Commit Staged` 后检查提交内容，确认只有已暂存文件进入提交。
