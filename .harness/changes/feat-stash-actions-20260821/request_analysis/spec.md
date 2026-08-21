# Stash 仓库操作需求规格

## 背景

`Changed Repositories` 仓库行已经提供切换分支、提交、拉取和推送等高频 Git 操作，但用户临时保存当前改动时仍需要离开该视图。本需求要在仓库行最右侧增加 `...` 更多操作入口，集中承载 `Stash` 和 `Apply Stash`，避免继续挤占行内空间。

## 范围（In Scope）

- 在 `changedRepository` 和 `pinnedRepository` 两类仓库行最右侧显示 `...` 更多按钮。
- 点击更多按钮后弹出 Quick Pick，包含 `Stash` 和 `Apply Stash` 两个操作。
- 选择 `Stash` 后弹出 message 输入框；输入必填且去除首尾空白，取消时不执行 Git 操作。
- Stash 执行 `git stash push -m <message>`，遵循 Git 默认语义：保存已跟踪文件的 staged/unstaged 改动，不包含 untracked 文件。
- 当仓库只有 untracked 改动或没有可 stash 的已跟踪改动时，给出信息提示，不显示误导性的成功消息。
- 选择 `Apply Stash` 后，读取当前仓库的 stash 列表，以 stash ref 和完整描述作为 Quick Pick 条目。
- 选中 stash 后执行 `git stash apply <stash-ref>`；成功 apply 后保留原 stash，不执行 drop/pop。
- stash 列表为空时显示信息提示；列表读取或 apply 失败时保留 Git 错误详情，写入现有 OutputChannel 并显示错误消息。
- Stash/Apply 完成后刷新当前仓库状态；Apply 因冲突失败时也要刷新，因为 Git 可能已部分改写工作区或 index。

## 非目标（Out of Scope）

- 不包含 untracked 或 ignored 文件，不传入 `--include-untracked` / `--all`。
- 不提供 `Pop Stash`、`Drop Stash`、`Clear Stashes`、创建 stash 分支或 stash 内容预览。
- 不在 Apply 后自动删除 stash，不在冲突时自动解决或回滚。
- 不重构现有 Commit/Pull/Push/Switch Branch 交互，不改变仓库选中和文件视图逻辑。
- 不新增设置项、快捷键、独立 Tree View 或 Webview。

## 核心场景

### 创建 Stash

1. 用户点击仓库行最右侧 `...`。
2. 更多操作 Quick Pick 显示 `Stash` 和 `Apply Stash`。
3. 用户选择 `Stash`，输入 message 并确认。
4. Extension 检查当前缓存状态是否有已跟踪改动，有则通过 `LocalGitRepository -> GitCli` 执行 stash。
5. 操作成功后刷新仓库和文件视图，并显示成功提示。

### Apply 指定 Stash

1. 用户从更多操作中选择 `Apply Stash`。
2. Extension 在进度提示中读取 stash 列表，Git 层用 NUL 分隔的自定义 format 返回 `ref + description`，避免依赖人类文本格式拆分。
3. 用户选中一条 stash，Extension 将其 ref 作为独立 argv 传入 `git stash apply`。
4. 操作成功后 stash 列表保持不变，工作区/index 状态刷新；冲突失败时显示 Git 错误并同样刷新。

## 验收标准

- `package.json` 注册更多操作命令，且 `view/item/context` 中对 `changedRepository` 和 `pinnedRepository` 都存在一个 `inline` 的 `...` 入口；通过显式 `@order` 保证其稳定位于仓库行所有其他内联操作之后。
- 更多操作 Quick Pick 只包含 `Stash` 和 `Apply Stash`，取消不产生 Git 调用。
- 空白 stash message 被输入验证拒绝；有效 message 以单个 argv 传入 `git stash push -m`，不包含 `--include-untracked` 或 `--all`。
- 只有 untracked 改动时不执行 stash，并显示无已跟踪改动的提示。
- stash 列表能正确保留含空格、冒号和非 ASCII 字符的描述，空输出得到空数组。
- Apply 使用选中条目的精确 stash ref 执行 `git stash apply <ref>`，不执行 `pop`/`drop`。
- Stash 成功、Apply 成功以及 Apply 冲突失败后，均调度当前仓库状态刷新。
- 新增 Git 命令只由 `src/git/` 层以 argv 数组发出，`domain/` 和 `views/` 不直接调用子进程。
- `npm run check`、`npm test` 和 `npm run harness:doctor` 全部退出码为 0，且单测 `pass > 0`。

## 风险与权衡

- VS Code Tree View 的行内入口无法直接承载完整子菜单交互，因此使用带 ellipsis 图标的命令按钮打开 Quick Pick；这符合现有扩展的 Quick Pick 交互模式，也避免平台特定菜单差异。
- `git stash apply` 可能返回非零退出码但已部分更改工作区；失败路径必须刷新状态，不能只显示错误。
- stash 列表描述是用户输入和 Git 生成内容，不能用冒号或空格做结构分隔；Git 层应使用 NUL 分隔的格式并进行专用解析。
- 仓库缓存状态可能与磁盘存在短暂延迟；前置检查用于改善明显空操作的提示，Git 命令仍是最终事实来源。
