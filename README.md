# SCM Repository Filter

VS Code 插件：在 Source Control 侧边栏新增 `Changed Repositories` 和 `Changed Files` 视图，分别用于筛选改动仓库和查看当前仓库的改动文件。

## 当前能力

- 读取 VS Code 内置 Git 扩展识别到的仓库。
- 过滤掉没有本地修改的仓库。
- `Changed Repositories` 只显示改动仓库，点击仓库名称会选中仓库但不会跳转目录。
- `Changed Files` 展示当前选中仓库的 Staged、Changes、Merge Changes 和 Untracked Changes。
- 即使没有工作区文件，`Changes` 分组也会保留显示，数量显示为 `0`。
- 点击文件节点打开 VS Code 原生 diff，查看代码改动点。
- 文件节点支持 Stage、Unstage；工作区和未跟踪文件支持 Discard，Discard 前会确认。
- `Changes` 分组支持一次性暂存所有工作区修改和未跟踪文件。
- `Staged Changes` 分组支持一次性取消暂存所有已暂存文件。
- 监听 Git 仓库状态以及文件保存、创建、删除、重命名事件，实时刷新改动仓库列表。
- 每秒对账一次内置 Git 缓存；即使 VS Code 合并或漏发某次状态事件，也会自动补刷新且不会额外运行 Git 命令。
- 支持手动刷新命令和 `Changed Repositories` 标题栏刷新按钮；刷新时会主动执行 Git status。
- 多仓库手动刷新最多并发执行 4 个 Git status，避免大型工作区出现命令拥挤或取消。
- 仓库节点箭头只负责展开/折叠，不再默认跳转目录。
- `Changed Files` 下方提供 `Commit staged changes` 和 `Push to remote` 操作入口。
- 提交入口使用 VS Code 原生输入框填写 commit message。
- `Changed Repositories` 仓库节点支持 `Commit Staged`、`Pull`、`Push` 操作。
- `Commit Staged` 只提交已经暂存的文件，不会自动暂存未暂存文件。
- `Pull` 和 `Push` 使用当前分支配置的默认远程。
- Stage、Unstage 成功后不显示提示；操作失败时显示错误提示并记录日志。

## Git 操作

在 `Changed Repositories` 中右键仓库节点，或使用仓库节点旁的操作图标：

- `Commit Staged`：必须先在 VS Code Source Control 中暂存文件，再输入提交信息。
- `Pull`：拉取当前分支默认远程。
- `Push`：推送当前分支默认远程。

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

后续代码更新后，重新执行 `npm run package`，再安装新的 VSIX 即可。使用前请确认 VS Code 内置 Git 扩展已启用。

## 仓库检测范围

插件只过滤 VS Code 内置 Git 扩展已经识别的仓库，不会主动打开磁盘上的其他仓库，因此不会改变原生 `Repositories` 列表。

如果用户设置中配置了：

```json
"git.autoRepositoryDetection": "openEditors"
```

VS Code 只会识别当前打开文件关联的仓库，未打开文件的嵌套仓库不会出现在插件中。需要监控工作区内所有仓库时，应调整 VS Code 的 `git.autoRepositoryDetection`、`git.scanRepositories` 和 `git.repositoryScanMaxDepth`，确保这些仓库先出现在原生 `Repositories` 视图中。

插件激活后会在 `SCM Repository Filter` 输出通道记录实际监听的仓库数量、文件事件命中的仓库和 status 刷新过程，便于排查检测范围与刷新问题。

## 开发验证

```bash
npm run check
npm run build
npm test
```

调试时在 VS Code 中打开本仓库，按 `F5` 启动 Extension Development Host，然后打开包含多个 Git 仓库的工作区，在 Source Control 侧边栏查看 `Changed Repositories` 和 `Changed Files`。

手动验证 Commit 时，可以准备一个已暂存文件和一个仅修改但未暂存的文件，执行 `Commit Staged` 后检查提交内容，确认只有已暂存文件进入提交。
