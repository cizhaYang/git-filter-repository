# Change Summary: feat-custom-repository-list-20260813

| 字段 | 值 |
|---|---|
| Change ID | feat-custom-repository-list-20260813 |
| 类型 | feat |
| 状态 | DELIVERED |
| 负责人 | Extension Owner Agent |
| 起止时间 | 2026-08-13 ~ 2026-08-13 |
| Spec | [request_analysis/spec.md](request_analysis/spec.md) |
| Tasks | [request_analysis/tasks.md](request_analysis/tasks.md) |

## 步骤进度表

| # | 步骤 | 状态 | 评审轮次 | 产出 | 时间 |
|---|---|---|---|---|---|
| 1 | 需求分析 | DONE | — | spec.md, tasks.md | 2026-08-13 |
| 2 | 编码实现 | DONE | — | coding/coding_report_v1.md | 2026-08-13 |
| 3 | 代码评审 | DONE | 3/2 | coding/review/code_review_v1.md, code_review_v2.md | 2026-08-13 |
| 4 | 测试与 CI | DONE | 1/2 | unit_test/test_plan.md, ci_result/ci_summary.md | 2026-08-13 |
| 5 | 提交与交付 | DONE | — | commit feb70cc | 2026-08-13 |

## HITL 确认点 ①

需求澄清 + 方案摘要已向用户展示，等待用户确认进入步骤 2（编码实现）。**已确认。**

## HITL 确认点（步骤 2 决策）

编码完成时 `npm test` 剩 1 个**既有失败**：`extensionManifest.test.cjs` 断言 `activationEvents` 而 `package.json` 历史无此字段（干净 HEAD 同样失败，与本 feature 无关）。**用户确认顺手补 `activationEvents`**，补后 `npm test` 全绿。

## 步骤 3 完成

代码评审 3 轮全部通过（Round1 发现 2 MUST FIX + 若干 → 修复；Round2 复核发现 all 模式 getMessage 残留 SHOULD + watcher 累积 LOW → 修复；Round3 终验 APPROVED）。`npm run check` 0、`npm test` 72/72、doctor 0 errors。

## 步骤 4 完成

测试与 CI：`npm run check` exit 0、`npm test` **82/82**、`harness-doctor` 0 errors。测试评审（expert test 模式）APPROVED（0 MUST FIX）。评审 5 条 SHOULD/LOW 建议中 3 条落地（越界反斜杠回归、持久化纯函数+用例、discover 模式分支断言），2 条留作已知限制（all→pinned 卸载无独立断言、既有 `test:unit` 脚本问题另开 change）。

## 经验沉淀（Hashimoto）
- Review Round1 暴露：**测试文件里 `Module._load` 拦截 `require("vscode")` 若每次调用都 new 一个 stub，provider 各模块会绑定不同 stub → config 监听空、模式切换测不出来**。已修：per-load 单 stub 复用。教训：vscode stub 必须单例复用，record 到 Skill/规则。
- Test review 暴露：安全敏感纯函数缺反斜杠/windows 分隔回归会是盲区；状态持久化路径抽纯函数可直接单测，避免靠 vscode.window mock。已落地为纯函数产出。
