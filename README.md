# SCM Repository Filter

一个专注于 **多仓库 / monorepo 工作区** 的 Git 扩展。它把工作区所有 Git 仓库（含嵌套仓库）的改动和操作集中到一个视图中，避免在大工作区里被大量无关仓库的改动淹没。

适合：
- 一个工作区里有大量仓库，只想关注其中少数几个
- monorepo 内嵌了多个独立 Git 仓库
- 需要在多个仓库之间快速查看改动、暂存、提交、推送、切分支
- 希望在 VS Code 的 SCM 面板中集中完成常见 Git 操作

## 功能总览

扩展提供两个视图（位于源码管理 `SCM` 面板底部）：

| 视图 | 说明 |
|---|---|
| **Changed Repositories** | 列出有改动的仓库（及你手动固定的常驻仓库），显示每个仓库当前所在分支 |
| **Changed Files** | 展示当前选中仓库的文件变更，按「已暂存 / 工作区改动 / 未跟踪 / 冲突」分组 |

工作区文件保存、创建、删除或重命名后，视图会自动刷新；后台状态对账也会同步外部 Git 操作。Changed Repositories 视图顶部的 Refresh 按钮可手动强制刷新。

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
- 输入后缀只需唯一命中仓库；如果命中多个仓库，弹出列表供选择
- 固定列表保存在设置 `scmRepositoryFilter.pinnedRepositories`（相对工作区根目录的路径数组，随项目提交可移植）
- 工作区中移动固定仓库后，原路径可能失效，需要重新 Pin

### 历史仓库与跨项目导入

每次成功 Pin 的仓库路径都会保存到扩展的本机历史中；升级后首次打开已有项目时，当前固定列表也会自动合并到历史。打开另一个结构相似的项目后，点击 Changed Repositories 工具栏的 **Repository History（历史）** 按钮即可：

- 查看曾经固定过的全部仓库路径，勾选部分项目后添加到当前工作区
- 使用列表顶部的 **Add all available history entries** 一键导入当前工作区能匹配的全部历史仓库
- 同名路径匹配多个仓库时，按提示选择实际要添加的仓库
- 点击每项右侧的删除按钮，仅删除本机历史记录；不会移除当前项目已经固定的仓库

历史只保存相对路径后缀，不会复制 Git 仓库文件，也不会自动修改新项目的配置。当前项目不存在的历史项会保留在列表中，但不能导入。

## 仓库级操作

在每个仓库条目上（内联按钮 / 右键菜单）可执行：

| 操作 | 说明 |
|---|---|
| **切分支** `$(git-branch)` | 弹出分支列表（本地 + 远端），选中即切换。远端分支（`origin/...`）会自动创建本地追踪分支；有未提交改动导致切分支失败时提示错误（不会自动 stash） |
| **提交暂存** `$(git-commit)` | 提交该仓库**已暂存**的改动，弹出输入框填提交信息 |
| **拉取** `$(cloud-download)` | 拉取 `git pull` |
| **推送** `$(cloud-upload)` | 推送 `git push`。当前分支没有上游且存在 `origin` 时，首次推送自动使用 `git push -u origin <分支>` |
| **查看 Git Graph** `$(history)` | 在该仓库根目录打开 [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)（需先安装 Git Graph 扩展） |

> 仓库条目上还直接显示**当前分支名**，一眼看清每个仓库在哪个分支。

## 文件级操作

选中某个仓库后，在 Changed Files 视图对文件 / 分组执行：

- **暂存**：对工作区改动或未跟踪文件执行 `git add`
- **取消暂存**：对已暂存文件执行取消暂存
- **丢弃改动**：还原已跟踪文件或删除未跟踪文件，执行前会二次确认
- **全部暂存**：对 Changes 分组中的工作区改动和未跟踪文件批量执行 `git add`
- **全部取消暂存**：对 Staged Changes 分组中的文件批量取消暂存
- **打开改动**：显示文件的 diff / 内容对比

冲突文件会单独显示在 Merge Changes 分组中，便于识别当前仓库的冲突状态。

## 命令

| 命令 | 用途 |
|---|---|
| `SCM Repository Filter: Refresh Changed Repositories` | 手动强制刷新所有仓库状态 |
| `SCM Repository Filter: Pin Repository` | 输入路径后缀并固定一个仓库，使其常驻显示 |
| `SCM Repository Filter: Manage Repository History` | 查看、选择导入或删除本机保存的固定仓库历史 |
| `SCM Repository Filter: Unpin Repository` | 移除当前固定仓库 |
| `SCM Repository Filter: Switch Branch` | 列出本地和远端分支并切换当前仓库分支 |
| `SCM Repository Filter: Commit Staged` | 输入提交信息并提交当前仓库已暂存的改动 |
| `SCM Repository Filter: Pull` | 拉取当前仓库的远端更新 |
| `SCM Repository Filter: Push` | 推送当前仓库的本地提交；新分支可自动设置 `origin` 上游 |
| `SCM Repository Filter: View Git Graph` | 使用 Git Graph 查看当前仓库历史 |
| `SCM Repository Filter: Stage` / `Unstage` | 暂存或取消暂存单个文件 |
| `SCM Repository Filter: Discard` | 丢弃单个文件的工作区改动 |
| `SCM Repository Filter: Stage All Changes` / `Unstage All Changes` | 按文件分组批量暂存或取消暂存 |

仓库条目和文件条目也提供对应的点击、内联按钮和右键菜单，日常操作不必打开命令面板。

## 配置

| 配置项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `scmRepositoryFilter.scanMode` | `pinned` \| `all` | `pinned` | 扫描模式：只扫固定仓库，或递归扫工作区所有仓库 |
| `scmRepositoryFilter.pinnedRepositories` | `string[]` | `[]` | 固定仓库相对工作区根目录的路径数组，如 `["originSource/acme/address"]`；Pin 操作输入的是路径后缀 |

## 使用场景示例

**场景一：大 monorepo，只关注两个仓库**
1. 保持默认 `pinned` 模式
2. 点 Pin 按钮，分别输入 `packages/backend`、`packages/web` 固定
3. 之后只在这两个仓库间工作，其它嵌套仓库的改动不会打扰你

**场景二：想看当前所有仓库的改动**
1. 设置 `scmRepositoryFilter.scanMode` 为 `all`
2. 扩展递归扫描出所有仓库，有改动的自动出现

**场景三：完成一次提交并推送**
1. 在 Changed Files 中暂存需要提交的文件
2. 在仓库条目上执行 **Commit Staged**，输入提交信息
3. 执行 **Push**；新分支存在 `origin` 时会自动建立上游

## 已知限制

- 固定仓库存储的是相对工作区根目录的路径；仓库移动或工作区目录变化后，原固定路径可能失效，需要重新添加
- 分支 QuickPick 会一次列出本地和远端分支，远端分支很多时列表可能较长
- 切换远端分支时会创建本地追踪分支（等同 `git checkout -b <name> origin/<name>`），不会进入 detached HEAD
- 切分支遇到未提交改动时会报错提示，需要你先处理改动（不自动 stash）
- 推送自动设置上游只针对名为 `origin` 的远端；没有 `origin` 时会执行普通 `git push`，由 Git 返回错误信息
- 已打开的 diff 基于打开时的内容快照，切换分支后不会强制重载已有 diff 标签页
- 「查看 Git Graph」依赖第三方 [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) 扩展

## 反馈

使用中有问题或建议，欢迎在 [GitHub](https://github.com/cizhaYang/git-filter-repository) 提交 Issue。
