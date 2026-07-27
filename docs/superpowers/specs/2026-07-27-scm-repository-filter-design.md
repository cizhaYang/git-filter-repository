# SCM Repository Filter VS Code 插件设计

## 背景

当前项目存在多个 Git 仓库嵌套在同一个 VS Code 工作区中的情况。VS Code 原生 Source Control 会展示所有已识别仓库，仓库数量多时难以快速判断哪些仓库真正有修改。

第一版插件目标是提供一个过滤视图：只显示当前存在本地变更的仓库。没有变更的仓库不展示，从而降低 Source Control 侧边栏噪音。

## 范围

第一版包含：

- 在 Source Control 侧边栏新增一个 `Changed Repositories` 视图。
- 读取 VS Code 内置 Git 扩展识别到的仓库列表。
- 仅展示存在本地变更的仓库。
- 仓库状态变化时自动刷新视图。
- 仓库增删时自动刷新视图。
- 提供手动刷新命令。
- 点击仓库时打开或聚焦仓库根目录。
- 为仓库节点预留 `contextValue`，后续可扩展右键 Git 操作。

第一版不包含：

- commit、pull、push。
- stage、unstage。
- 提交信息输入。
- 冲突解决。
- 远程分支状态展示。
- 自行递归扫描 `.git` 目录作为 fallback。

这些能力会作为后续版本基于同一视图逐步增加。

## 推荐方案

采用 VS Code 内置 Git 扩展 API 作为仓库来源。

原因：

- 与 VS Code 原生 Source Control 对仓库的识别保持一致。
- 不需要自行处理递归扫描、忽略目录、符号链接和跨平台路径差异。
- 后续增加 commit、pull、push 等操作时，可以继续沿用 Git 扩展 API。
- 状态刷新可复用 Git 扩展提供的 repository state change 事件。

约束：

- 插件依赖 VS Code 内置 Git 扩展启用。
- 如果 Git 扩展未启用或 API 获取失败，视图展示空状态并提示用户启用 Git 扩展。

## 架构

插件由以下模块组成：

- `extension.ts`
  - 插件入口。
  - 激活 Git 扩展。
  - 创建 TreeDataProvider。
  - 注册视图和命令。

- `gitApi.ts`
  - 封装 VS Code Git 扩展 API 获取逻辑。
  - 隔离 Git 扩展 API 类型和版本差异。

- `changedRepositoryProvider.ts`
  - 实现 `TreeDataProvider`。
  - 维护当前 Git 仓库列表。
  - 根据仓库状态过滤有变更仓库。
  - 监听仓库状态和仓库列表变化。

- `repositoryTreeItem.ts`
  - 将 Git 仓库转换为 TreeItem。
  - 展示仓库名称、路径和变更数量。
  - 设置图标、tooltip、command 和 contextValue。

## 变更判断

仓库被认为“有修改”的条件：

- `repository.state.indexChanges.length > 0`
- 或 `repository.state.workingTreeChanges.length > 0`
- 或 `repository.state.mergeChanges.length > 0`

展示的变更数量为以上三类变更数量之和。

这样可以覆盖已暂存、未暂存和合并冲突中的本地变更。未跟踪文件是否出现在 `workingTreeChanges` 中由 VS Code Git 扩展负责，插件不自行执行 `git status`。

## 数据流

1. 插件激活。
2. 获取内置 Git 扩展 API。
3. 读取 `git.repositories`。
4. 过滤出有变更的仓库。
5. Tree View 渲染仓库节点。
6. 当仓库状态变化或仓库列表变化时，触发 Tree View 刷新。
7. 用户执行手动刷新时，重新读取并渲染。

## 交互

视图标题：`Changed Repositories`

仓库节点展示：

- label：仓库目录名。
- description：相对工作区路径。
- tooltip：完整路径和变更数量。
- icon：使用 VS Code 内置 repository 图标或 theme icon。
- badge/description：展示变更数量，例如 `3 changes`。

命令：

- `scmRepositoryFilter.refresh`
  - 手动刷新视图。
- `scmRepositoryFilter.openRepository`
  - 打开仓库根目录。

后续预留命令：

- `scmRepositoryFilter.pull`
- `scmRepositoryFilter.commit`
- `scmRepositoryFilter.push`
- `scmRepositoryFilter.stageAll`

第一版只注册已实现命令。预留命令不注册，避免用户看到不可用入口。

## 空状态和错误处理

没有有变更的仓库时：

- Tree View 展示空列表。
- package metadata 中配置 welcome view 文案，提示当前没有修改的仓库。

Git 扩展不可用时：

- 视图展示空列表。
- welcome view 提示需要启用 VS Code 内置 Git 扩展。
- 输出日志记录失败原因。

读取仓库状态失败时：

- 跳过异常仓库。
- 输出日志记录仓库路径和错误信息。
- 不阻塞其他仓库展示。

## 测试

单元测试：

- 有变更仓库会被展示。
- 无变更仓库会被过滤。
- index、working tree、merge changes 任一非空都会被判定为有变更。
- 变更数量计算正确。
- Git API 不可用时返回空列表。

集成或手动验证：

- 在单工作区多仓库场景下，只显示有变更仓库。
- 修改文件后视图自动出现对应仓库。
- 还原所有修改后仓库从视图中消失。
- 点击仓库能打开或聚焦仓库根目录。
- 手动刷新命令可用。

## 后续扩展

后续增加 Git 操作时，优先在仓库节点右键菜单中添加命令，并复用当前节点的仓库上下文。

扩展顺序建议：

1. `Open Terminal Here`
2. `Pull`
3. `Push`
4. `Commit`
5. `Stage / Unstage`

commit 功能需要额外设计提交信息输入、空提交保护、提交失败反馈和冲突状态提示，不纳入第一版。
