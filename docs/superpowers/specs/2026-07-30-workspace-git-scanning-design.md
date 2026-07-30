# 工作区 Git 仓库自主扫描设计

## 目标

让 `SCM Repository Filter` 不再依赖 VS Code 内置 Git 扩展的 `repositories` 列表。插件从当前 VS Code 工作区根目录及其嵌套目录中发现 Git 仓库，并通过 Git CLI 获取状态和执行 Git 操作。

## 背景与边界

当前插件通过 `vscode.git` API 获取仓库对象、仓库状态和 Git 操作。这样只有被 VS Code 内置 Git 扩展识别并放入 `repositories` 的仓库才会被监听和展示。

本次改动的范围是：

- 只扫描 `vscode.workspace.workspaceFolders` 提供的工作区根目录。
- 支持单根和多根工作区，以及工作区内嵌套仓库。
- 默认扫描最大深度为 10；扫描规则需要保留后续配置化的边界。
- 跳过 `.git`、`node_modules`、`dist`、`out` 和 `.vscode` 等不会产生独立仓库的目录。
- 识别 `.git` 目录和 `.git` 文件，以兼容普通仓库、子模块和部分 worktree 结构。
- 不扫描工作区外的仓库，也不改变 VS Code 原生 Source Control 的仓库列表。

本次改动不包含：

- 实现独立 Git 协议或替代系统 Git 可执行文件。
- 通过网络搜索或扫描整个磁盘发现仓库。
- 修改用户的 Git 配置。

## 方案选择

### 方案一：纯 Git CLI（采用）

扫描器只负责发现仓库路径，Git CLI 适配器负责状态读取和仓库操作。仓库状态模型由插件维护，Tree View 不再要求 VS Code Git API 的仓库对象。

优点是完全解除 `vscode.git` 依赖，行为边界清晰，也能发现原生 `Repositories` 列表没有展示的嵌套仓库。代价是需要解析 `git status` 输出，并自行处理 Git 命令错误和状态刷新。

### 方案二：自主扫描后交给 VS Code Git API

扫描出仓库路径后尝试调用内置 Git API 注册或打开仓库。该方案改动较小，但仍依赖 Git 扩展，并且 API 不保证支持按路径注册仓库，因此不满足“完全不依赖”的目标。

### 方案三：内置 Git API 与自主扫描并行

保留原生仓库作为主来源，用扫描结果补充遗漏仓库。该方案需要处理同一仓库的重复识别、两套状态同步和不同 Git 操作实现，复杂度高于收益，因此不采用。

## 架构

新增三个职责边界：

1. `workspaceRepositoryScanner`
   - 输入工作区根目录列表和扫描选项。
   - 输出去重后的仓库根路径。
   - 只负责文件系统发现，不执行 Git 命令。

2. `gitCli`
   - 输入仓库路径，调用系统 `git` 可执行文件。
   - 解析 `status --porcelain=v1 -z` 为统一的仓库状态。
   - 封装 status、add、restore、clean、commit、pull、push 等操作。
   - 统一处理退出码、stderr 和 Git 未安装错误。

3. `workspaceRepositoryProvider`
   - 持有当前发现的仓库对象和状态。
   - 负责扫描、状态刷新、仓库级文件监听和 Tree View 数据输出。
   - 保留当前选择状态、Changed Repositories 和 Changed Files 的交互。

现有的 `GitRepositoryLike` 会被替换为与实现无关的本地仓库模型，例如：

```ts
interface LocalGitRepository {
  rootUri: vscode.Uri;
  name: string;
  state: {
    indexChanges: GitChange[];
    workingTreeChanges: GitChange[];
    mergeChanges: GitChange[];
    untrackedChanges: GitChange[];
  };
}
```

状态对象必须保留文件绝对路径和必要的原始状态码，方便 Changed Files 展示、diff、暂存和丢弃操作。

## 仓库发现

扫描器从每个工作区根目录开始执行深度优先遍历：

- 当前目录包含 `.git` 目录时，将当前目录作为仓库加入结果，并停止继续扫描其子目录，避免把仓库内部目录误判为独立仓库。
- 当前目录包含 `.git` 文件时，同样将当前目录作为仓库加入结果。
- 遇到排除目录时不进入。
- 深度超过最大值时停止向下遍历。
- 使用规范化绝对路径作为去重 key；多根工作区包含同一仓库路径时只保留一个结果。
- 文件系统权限错误只跳过当前目录并记录日志，不中断整个扫描。

扫描结果变化后，Provider 会为新增仓库建立监听，为消失的仓库释放监听，并重新刷新状态。

## Git 状态解析

使用：

```text
git -C <root> status --porcelain=v1 -z --untracked-files=all
```

`-z` 用 NUL 分隔路径，避免文件名包含空格、换行或特殊字符时被错误拆分。解析规则：

- 第一列为 index 状态，非空时进入 `indexChanges`。
- 第二列为 working tree 状态，非空时进入 `workingTreeChanges`。
- `??` 进入 `untrackedChanges`。
- 冲突状态进入 `mergeChanges`，不重复加入普通 staged 或 working tree 分组。
- 重命名和复制记录保留新旧路径，Changed Files 可以显示新路径并用于后续操作。
- 状态为空时仓库仍保留在扫描结果中，但不出现在 Changed Repositories。

状态解析作为无 vscode 依赖的纯函数实现，使用固定样例覆盖普通修改、暂存、未跟踪、冲突、重命名和特殊字符路径。

## Git 操作

所有操作均通过 `execFile` 执行，参数使用数组传入，避免 shell 拼接路径和提交信息：

- 暂存：`git -C <root> add -- <paths...>`
- 取消暂存：`git -C <root> restore --staged -- <paths...>`
- 丢弃工作区修改：`git -C <root> restore -- <paths...>`；未跟踪文件使用 `git clean -f -- <paths...>`，执行前仍保留现有确认弹窗。
- 提交：`git -C <root> commit -m <message>`，只提交 index，不自动暂存。
- 拉取：`git -C <root> pull`
- 推送：`git -C <root> push`

命令失败时保留 stderr，并通过现有 VS Code 错误提示和输出通道反馈。操作成功后执行目标仓库的 status 刷新。

## 刷新与监听

- 插件激活时先扫描工作区，再为发现的仓库执行初始 status。
- 工作区文件创建、删除、重命名事件触发重新扫描，以发现新仓库或移除已删除仓库。
- 仓库内部非 `.git` 文件变化触发该仓库的 status 刷新；`.git` 元数据变化不直接触发文件监听循环。
- 保留当前短延迟合并刷新机制，避免一次保存引起多轮 Git 命令。
- 保留每秒一次的缓存状态对账，但对账读取插件自己的状态，不依赖 VS Code Git API。
- 手动刷新执行所有已发现仓库的 status，沿用最多 4 个并发限制。

## 激活和错误处理

- 删除 `extensionDependencies: ["vscode.git"]`，插件不再要求内置 Git 扩展启用。
- 没有工作区时，视图显示无工作区提示，不执行全盘扫描。
- Git 不可执行时，视图显示 Git CLI 不可用提示，并在输出通道记录具体错误。
- 单个目录扫描失败或单个仓库 status 失败时，只跳过失败对象，其他仓库继续展示。
- 仓库路径被删除、移动或失去权限时，下一次扫描移除该仓库及其监听。

## 测试策略

纯逻辑优先测试：

- 扫描器识别 `.git` 目录和 `.git` 文件。
- 扫描器遵守最大深度、排除目录和去重规则。
- status 解析器处理所有变更分组、冲突、重命名和特殊字符路径。
- Git CLI 适配器使用可注入的命令执行器验证参数顺序和错误传播。
- Provider 在仓库新增、移除、状态变化后正确刷新监听和选择状态。
- 现有 Tree View、文件操作和提交边界测试继续通过。

验证命令：

```bash
npm run check
npm run build
npm test
```

## 兼容性说明

本功能不涉及 `.scss`、`.css` 或 RN 样式文件，因此不新增样式兼容处理。新增的扫描、CLI 调用和状态解析分支需要注释其业务原因、参数约束和 Git 状态码含义，避免后续误删边界处理。
