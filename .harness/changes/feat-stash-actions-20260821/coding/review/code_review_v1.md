# 代码评审 v1

- **mode**: execution
- **verdict**: APPROVED

## 机器化检查

| 检查 | 结果 |
|---|---|
| `npm run check` | exit 0 |
| `npm test` | exit 0，110/110 pass，pass > 0 |
| 分层 import 扫描 | `domain/` 无 vscode；`git/` 仅保留原有 `localGitRepository`/文档 provider 的 vscode 依赖，新增 Git CLI 无 vscode |
| `package.json` ↔ `extension.ts` 命令交叉 | 0 missing |
| `npm run harness:doctor` | 0 errors, 0 warnings |
| `git diff --check` | exit 0 |

## 语义复核

- Git 命令只在 `src/git/gitCli.ts` 通过 argv 数组发出；message/ref 均是独立参数，无 shell 拼接。
- `stash push` 未传 `--include-untracked` 或 `--all`，与已确认的只保存 tracked 改动语义一致。
- stash list 用 NUL 分隔 ref/description，损坏字段显式抛错，测试覆盖中文、冒号、空列表和损坏输出。
- Apply 不执行 pop/drop；调用之后在 `finally` 调度状态刷新，包括冲突失败路径。
- ellipsis 只在 repository item 上显示，同时匹配 changed/pinned context，在 inline 菜单中位于其它仓库操作之后。
- UI 层对取消、无 tracked 改动、空 stash 列表、Git 读取失败和 apply 失败均有明确用户反馈，错误同步写入 OutputChannel。

## 问题分级

无 MUST FIX、SHOULD、LOW 问题。
