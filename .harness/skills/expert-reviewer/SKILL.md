---
name: expert-reviewer
description: 步骤 3 / 4 评审循环。触发场景："评审 spec"、"评审代码"、"评审测试"、"plan review"、"code review"、"test review"。基于不同模式（plan/execution/test）输出分级评审意见，给出 APPROVED 或 REVISION REQUIRED 决议。
---

# Skill: expert-reviewer

## 模式

| 模式 | 评审对象 | 关注点 |
|---|---|---|
| `plan` | spec.md + tasks.md | 完整性、范围合理、验收可校验、风险识别 |
| `execution` | 代码变更 + coding_report | 是否符合 spec、三层红线、错误处理、事件闭环 |
| `test` | 单测 | 改动驱动覆盖、行为视角断言、mock 走依赖注入、独立可重跑 |

## 输入
- 评审对象路径
- 对应 Rules（plan: project-structure；execution: coding-standard + project-structure；test: coding-standard §10）

## 步骤
1. **独立性原则**：评审 Agent 不得阅读编码 Agent 的"自我评估"；只看产出物本身。
2. 按 mode 加载对应检查清单。
3. 逐条产出意见，每条必须含：
   - **位置**：文件:行号 或章节名
   - **问题**：具体观察到的现象（非感受）
   - **建议**：可操作的修改方向
   - **分级**：`MUST FIX` / `SHOULD` / `LOW` / `INFO`
4. 给出最终 verdict：
   - 0 条 MUST FIX → `APPROVED`
   - ≥1 条 MUST FIX → `REVISION REQUIRED`

## 输出
- 文件名约定：`{stage}_review_v{n}.md`，`n` 单调递增，**旧版本不删**（Audit Trail）。

## 必查项（按模式）

### plan
- [ ] 「非目标」章节存在且非空
- [ ] 每条验收标准都可被命令或断言校验
- [ ] 风险章节列出 ≥1 个失败模式与缓解措施
- [ ] tasks 拆解后每个 task 工作量 ≤ 0.5 天

### execution
- [ ] 依赖方向合规：`views → git → domain`，无反向/同层环
- [ ] `domain/`、`git/` 未 import `vscode`（除非该文件本身是 vscode 类型定义）
- [ ] `views/`、`domain/` 未直接 spawn/exec Git 命令
- [ ] 没有 `any` / `console.log` / 长任务未背景化
- [ ] 错误状态在视图层可观测（`setMessage` / welcome view / 状态条反馈）
- [ ] 新增命令与 `package.json` `contributes` 一致
- [ ] 改动 ≠ spec 时显式标注偏差并解释

### test
- [ ] 改动文件与新增/修改的测试一一对应
- [ ] 断言走行为视角（解析结果、状态机输入输出），无 UI 线程/真实 Git 依赖
- [ ] mock 全部通过依赖注入替换 `vscode` 类接口，无全局 patch
- [ ] 测试可在 `node --test test/unit` 下独立重跑通过

## Checklist（产出文件本身）
- [ ] 含 verdict（APPROVED / REVISION REQUIRED）
- [ ] 含 mode 字段
- [ ] 每条意见有分级
- [ ] 文件名带 v{n} 版本号
