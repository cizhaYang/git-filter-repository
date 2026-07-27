# SCM Repository Filter

VS Code 插件：在 Source Control 侧边栏新增 `Changed Repositories` 视图，只显示当前存在本地改动的 Git 仓库。

## 第一版能力

- 读取 VS Code 内置 Git 扩展识别到的仓库。
- 过滤掉没有本地修改的仓库。
- 展开仓库后显示该仓库下的改动文件。
- 点击文件节点打开 VS Code 原生 diff，查看代码改动点。
- 仓库状态变化、仓库打开/关闭时自动刷新。
- 支持手动刷新命令：`Refresh Changed Repositories`。
- 仓库节点只负责展开/折叠，不再默认跳转目录。
- 预留仓库节点 `contextValue`，后续可继续加 `pull`、`commit`、`push` 等右键操作。

## 开发验证

```bash
npm run check
npm run build
npm test
```

调试时在 VS Code 中打开本仓库，按 `F5` 启动 Extension Development Host，然后打开包含多个 Git 仓库的工作区，在 Source Control 侧边栏查看 `Changed Repositories`。
