# Code Review v2 — feat-custom-repository-list-20260813（最终评审结论）

> round 2 产物：机器检查 + expert-reviewer 两轮语义评审已达 APPROVED。

## 评审轮次回顾

| 轮次 | verdict | 关键发现 | 处置 |
|---|---|---|---|
| Round 1（机器 + expert） | NOT-APPROVED | MF1 watcher 生命周期、MF2 路径越界逃逸、SHOULD discover 扫描阻塞、SHOULD getMessage 矛盾、LOW 若干、INFO 缺测试 | 全部修复 |
| Round 2（expert 复核） | NOT-APPROVED | MF1/MF2 已验证正确；残留 SHOULD：all 模式 getMessage 矛盾未覆盖；LOW：watcher 条目累积；INFO：缺测试 | 本次修复 |
| Round 3（expert 终验） | **APPROVED** | 全部通过，无回归 | — |

## 本轮（Round 2→3）修复内容

1. **[SHOULD] all 模式 getMessage 矛盾**：`getMessage()` 不再用 `getChangedRepositories().length`（会漏掉固定但零改动的常驻仓库），改判 `getVisibleRepositories().length > 0` 即不报空态。新增 2 条单测覆盖（有固定→undefined；无固定无改动→空态文案）。
2. **[LOW] watcher 累积**：`uninstallWorkspaceWatchers` 除 dispose 外，还从全局 `subscriptions` splice 移除已 dispose 条目，pin↔all↔pin 反复切换不再累积。
3. **[INFO] 补测**：all 模式空态/非空态消息都有测试。

## 门禁复核（Round 3）

- `npm run check` → exit 0 ✅
- `npm test` → **72 / 72 pass** ✅
- `npm run harness:doctor` → 0 errors ✅

## 结论

**APPROVED**。全部 MUST FIX / SHOULD / LOW / INFO 与已知限制处理完毕：
- 已知限制：`pinned` 模式添加命令用浅层扫描（+已知根）候选，深层未固定仓库不在 QuickPick 候选内但命中后缀仍可唯一输入；case-sensitive 匹配为文档化有意行为。
