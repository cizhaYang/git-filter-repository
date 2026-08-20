# Change Summary: feat-commit-push-buttons-20260816

| 字段 | 值 |
|---|---|
| Change ID | feat-commit-push-buttons-20260816 |
| 类型 | feat |
| 状态 | DELIVERED |
| 负责人 | Extension Owner Agent |
| 起止时间 | 2026-08-16 ~ 2026-08-18 |
| Spec | [request_analysis/spec.md](request_analysis/spec.md) |
| Tasks | [request_analysis/tasks.md](request_analysis/tasks.md) |

## 步骤进度表

| # | 步骤 | 状态 | 评审轮次 | 产出 | 时间 |
|---|---|---|---|---|---|
| 1 | 需求分析 | DONE | — | spec.md, tasks.md | 2026-08-16 |
| 2 | 编码实现 | DONE | — | coding/coding_report_v1.md | 2026-08-16 |
| 3 | 代码评审 | DONE | 1/2 | typescript-reviewer（Warn，0 CRITICAL/HIGH） | 2026-08-16 |
| 4 | 测试与 CI | DONE | — | 88/88 全绿 + 真实 git 集成验证 | 2026-08-16 |
| 5 | 提交与交付 | DONE | — | commit（实现随 6b8ea68 等一并提交） | 2026-08-18 |

## HITL 确认点 ①（需求）

三点已确认：①按钮范围=固定仓库也显示；②提交交互=保持现状（提交已暂存内容）；③push=自动 `-u origin <branch>`；remote=固定 origin。

## 关键结论

- commit/push 命令与逻辑**本已存在**，缺口仅是按钮 `when` 条件未覆盖 `pinnedRepository`，以及 push 无自动上游。
- push 自动上游封装在 `GitCli.push()` 内部，上层（LocalGitRepository/domain/views）零改动、零感知——分层干净。

## 代码评审处理（step 3）

typescript-reviewer 结论 Warn，0 CRITICAL/HIGH。处理：
- **M2**（裸 catch 吞探测诊断）→ 已修：三个探测方法加 `console.warn("[git] ...")` 留痕，符合项目"仅 console.warn 带语义前缀"约定，且失败一律保守回退裸 push（不掩盖真实错误，git 会报错）。
- **L2**（特殊字符分支名未测）→ 已修：新增含空格/多字节分支名的 argv 安全用例。
- **L3**（manifest includes 断言脆弱）→ 已修：openGitGraph 改精确 when 断言。
- **M1**（probe-then-act 竞态）→ 不处理（极低概率的真实 git 行为，错误会经 runRepositoryOperation 透出）。**已知限制**。
- **L1**（`%(upstream)` 风格偏好）→ 不改（现实现经评审确认 argv 安全）。

## 质量门禁

- `npm run check`：exit 0
- `npm test`：88/88（改动前 82）
- `harness:doctor`：0 errors, 0 warnings
- 真实 git 集成验证：新分支自动 `-u origin`、已有上游裸 push 均通过

## 经验沉淀（Hashimoto）
- 需求"增加按钮"实际发现命令已存在——**先查现状盘点再动手，避免重复造轮子**。缺口只是 `package.json` 菜单 `when` 与 push 上游探测。
- push 自动上游把"查分支+判上游+判 origin"完全内聚在 git 层，用 argv 数组传分支名，天然免 shell 注入——已把该约束编码为 `test/unit/gitCli.test.cjs` 的特殊字符分支名用例，防未来回退成 shell 拼接。
