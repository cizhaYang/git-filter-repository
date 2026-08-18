# Coding Report: feat-commit-push-buttons-20260816

## 交付摘要

在固定仓库（pinned）常驻条目上暴露 commit / pull / push 内联按钮，并让 push 对新分支自动设置上游（`git push -u origin <branch>`）。

## 改动文件

| 文件 | 改动 |
|---|---|
| `package.json` | `commitStaged` / `pull` / `push` 三个 `view/item/context` inline 菜单的 `when` 追加 `|| viewItem == pinnedRepository`，让固定仓库也能显示操作按钮。`openGitGraph` 保持仅 `changedRepository`。 |
| `src/git/gitCli.ts` | `push()` 增强：探测当前分支（`branch --show-current`）→ 判断是否已有上游（`rev-parse --abbrev-ref <branch>@{upstream}`）→ 判断是否存在 `origin` remote（`remote get-url origin`）。新分支有 origin 时 `push -u origin <branch>`；否则退回裸 `push`。探测失败一律 `console.warn("[git] ...")` 留痕（符合项目"仅 console.warn 带语义前缀"约定），返回保守值让 push 走裸 push 由 git 报错，不吞掉真实错误。 |
| `test/unit/gitCli.test.cjs` | 新增 4 个 push 用例：无上游建 upstream、已有上游裸 push、无 origin 退回裸 push、detached HEAD 裸 push；另加含空格/多字节分支名的 argv 安全用例（锁定"数组参数=无 shell 注入"约束）。 |
| `test/unit/extensionManifest.test.cjs` | 断言 commit/pull/push 菜单 when 同时匹配 `changedRepository` 与 `pinnedRepository`；`openGitGraph` 精确断言 when 仅匹配 `changedRepository`。 |

## 分层符合性

- Git 命令只经 `src/git/gitCli.ts`，参数一律数组传入 subprocess，无 shell 字符串拼接。
- 新增的「分支/上游/origin 探测」完全封装在 gitCli 内部，`LocalGitRepository`、`domain`、`views` 各层零改动、零感知。
- `gitCli.ts` 不 import `vscode`，探测诊断用 `console.warn`（带 `[git]` 前缀）。

## 提交语义

保持现状（用户明确要求）：Commit 只提交已暂存内容（`git commit` 不带 `--all`）。本次只改按钮显隐与 push 上游，未触碰 commit 逻辑。

## 质量门禁

- `npm run check`（tsc --noEmit）：exit 0
- `npm test`：88/88 全绿（改动前 82，新增 6 个）
- `harness:doctor`：0 errors, 0 warnings
