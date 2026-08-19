# SCM Repository Filter

一个专注于 **多仓库 / monorepo 工作区** 的 Git 扩展。它把工作区所有 Git 仓库（含嵌套仓库）的改动和操作集中到一个视图中，避免在大工作区里被大量无关仓库的改动淹没。

适合：
- 一个工作区里有大量仓库，只想关注其中少数几个
- monorepo 内嵌了多个独立 Git 仓库
- 需要在多个仓库之间快速查看改动、暂存、提交、推送、切分支

## 功能总览

扩展提供两个视图（位于源码管理 `SCM` 面板底部）：

| 视图 | 说明 |
|---|---|
| **Changed Repositories** | 列出有改动的仓库（及你手动固定的常驻仓库），显示每个仓库当前所在分支 |
| **Changed Files** | 展示当前选中仓库的文件变更，按「已暂存 / 工作区改动 / 未跟踪 / 冲突」分组 |

## 仓库扫描模式（核心）

扩展扫描仓库分两种模式，通过设置 `scmRepositoryFilter.scanMode` 切换（默认 `pinned`）：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `pinned`（默认） | 只扫描 / 刷新**手动固定的仓库**，不递归扫工作区 | 嵌套仓库很多、只关注少数仓库的工作区 |
| `all` | **递归扫描**工作区下所有仓库，有改动即显示 | 希望自动发现所有改动，覆盖 monorepo 嵌套仓库 |

> 手动添加的固定仓库（见下）在**两种模式下都常驻显示**。

### 手动固定仓库

使用视图工具栏的 **Pin（+）** 按钮，输入仓库在 workspace 中的相对路径后缀（如 `acme/address`）即可添加一个固定仓库：

- 固定仓库**无论是否有改动都常驻显示**在 Changed Repositories 中，带 📌 Pin 图标
- 右键固定仓库可 **Unpin（移除固定）**
- 固定列表保存在设置 `scmRepositoryFilter.pinnedRepositories`（相对路径数组，随项目提交可移植）

## 仓库级操作

在每个仓库条目上（内联按钮 / 右键菜单）可执行：

| 操作 | 说明 |
|---|---|
| **切分支** `$(git-branch)` | 弹出分支列表（本地 + 远端），选中即切换。远端分支（`origin/...`）会自动创建本地追踪分支；有未提交改动导致切分支失败时提示错误（不会自动 stash） |
| **提交暂存** `$(git-commit)` | 提交该仓库**已暂存**的改动，弹出输入框填提交信息 |
| **拉取** `$(cloud-download)` | 拉取 `git pull` |
| **推送** `$(cloud-upload)` | 推送 `git push`。新分支首次推送自动带上游（`git push -u origin <分支>`） |
| **查看 Git Graph** `$(history)` | 在该仓库根目录打开 [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)（需先安装 Git Graph 扩展） |

> 仓库条目上还直接显示**当前分支名**，一眼看清每个仓库在哪个分支。

## 文件级操作

选中某个仓库后，在 Changed Files 视图对文件 / 分组执行：

- **暂存** / **取消暂存**（单文件，Staged / 未暂存）
- **丢弃改动**（有二次确认）
- **全部暂存** / **全部取消暂存**（按分组批量）
- **打开改动**：显示文件的 diff / 内容对比

## 命令

| 命令 | 用途 |
|---|---|
| `SCM Repository Filter: Refresh Changed Repositories` | 手动强制刷新所有仓库状态 |
| `SCM Repository Filter: Switch Branch` | 切换当前选中仓库的分支 |

## 配置

| 配置项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `scmRepositoryFilter.scanMode` | `pinned` \| `all` | `pinned` | 扫描模式：只扫固定仓库，或递归扫工作区所有仓库 |
| `scmRepositoryFilter.pinnedRepositories` | `string[]` | `[]` | 固定仓库相对路径后缀数组，如 `["acme/address"]` |

## 使用场景示例

**场景一：大 monorepo，只关注两个仓库**
1. 保持默认 `pinned` 模式
2. 点 Pin 按钮，分别输入 `packages/backend`、`packages/web` 固定
3. 之后只在这两个仓库间工作，其它嵌套仓库的改动不会打扰你

**场景二：想看当前所有仓库的改动**
1. 设置 `scmRepositoryFilter.scanMode` 为 `all`
2. 扩展递归扫描出所有仓库，有改动的自动出现

## 已知限制

- 切换远端分支时会创建本地追踪分支（等同 `git checkout -b <name> origin/<name>`），不会进入 detached HEAD
- 切分支遇到未提交改动时会报错提示，需要你先处理改动（不自动 stash）
- 「查看 Git Graph」依赖第三方 [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) 扩展

## 反馈

使用中有问题或建议，欢迎在 [GitHub](https://github.com/cizhaYang/git-filter-repository) 提交 Issue。
