# Rule: 开发流程规范（5-Step Pipeline）

> 这是 Harness 的**结构化执行**支柱。所有变更走相同 5 步——**流程一致性 优先于 流程效率**。
> 每步三要素：**入场条件 / Skill 加载 / 质量门禁**；门禁必须**可程序化校验**。

---

## 步骤 1 — 需求分析（Request Analysis）

| 项 | 内容 |
|---|---|
| 入场 | 用户输入新需求 |
| Skill | `request-analysis` |
| 产出 | `changes/{id}/request_analysis/spec.md` + `tasks.md` |
| 门禁 | 两个文件存在；`spec.md` 含「背景 / 范围 / 非目标 / 验收标准 / 风险」5 个章节；`tasks.md` 每个 task 含「目标 / 输入 / 输出 / 验收 / 依赖」5 项 |
| **HITL 确认点 ①** | 含糊点列出后等用户确认再写 spec；澄清完成后展示摘要，用户确认进入步骤 2 |

---

## 步骤 2 — 编码实现（Coding）

| 项 | 内容 |
|---|---|
| 入场 | 步骤 1 完成 + 用户确认 |
| Skill | `coding-skill`（含分层 Spec：domain / git / views / extension） |
| 产出 | 代码变更 + `coding/coding_report_v{n}.md`（含改动文件列表、关键决策记录） |
| 门禁 | `npm run check` 通过；改动符合 `project-structure.md` 三层红线 |

---

## 步骤 3 — 代码评审（Code Review）

| 项 | 内容 |
|---|---|
| 入场 | 步骤 2 完成 |
| Skill | `code-review`（机器检查）+ `expert-reviewer`（execution 模式，语义检查） |
| 产出 | `coding/review/code_review_v{n}.md` |
| 门禁 | `npm run check` 全绿；评审 verdict APPROVED；无 MUST FIX 意见 |
| 失败回退 | 编译/三层红线违规 → 回步骤 2；语义 MUST FIX 且 ≤2 轮 → 回步骤 2；超出 → HITL |
| **HITL 确认点 ②** | 评审通过后用户确认进入步骤 4 |

---

## 步骤 4 — 测试与 CI（Test & CI）

| 项 | 内容 |
|---|---|
| 入场 | 步骤 3 通过 |
| Skill | `unit-test-write` → `expert-reviewer`（test 模式） |
| 产出 | 单测文件（`test/unit/*.test.cjs`）+ `unit_test/test_plan.md` + `ci_result/ci_summary.md` |
| 门禁（**程序化**） | `npm run check` 退出码 == 0 **且** `npm test` 退出码 == 0 **且** `pass > 0`（不能 0 用例空跑）；测试评审 verdict APPROVED |
| 失败回退 | 用例数 == 0 → 补测试；编译错误 → 回步骤 2；测试 MUST FIX ≤2 轮 → 改测试；超出 → HITL |

> **核心经验**：退出码 0 不等于真正通过——必须额外校验 `pass > 0`。

---

## 步骤 5 — 提交与交付（Commit & Delivery）

| 项 | 内容 |
|---|---|
| 入场 | 步骤 4 通过 |
| Skill | （无，Owner 直接执行） |
| 产出 | git commit（footer 含 `Change: {change-id}`）+ `summary.md` 状态置 `DELIVERED`；可选：`npm run build` + Extension Development Host 自检 + `deployment/preview_report.md` |
| 门禁 | `git status` 干净；commit message 符合 Conventional Commits |
| **HITL 确认点 ③** | 发布参数（版本号 bump / 是否打 vsix）由人工最终确认；用户书面确认后 change 目录归档 |

---

## 通用规则

- **循环上限**：代码评审 ≤ 2，测试评审 ≤ 2。超出立即上升到 Human-in-the-Loop，不允许 Agent 自我无限纠错。
- **回退路径**精确到步骤编号：避免"出问题就从头来"的低效。
- **summary.md 必须每步结束立即更新**，不允许批量补登。
- 任何步骤**禁止**跳过；"小改动"也走完整流程——流程一致性是廉价保险。
