---
name: request-analysis
description: 步骤 1 — 需求分析。触发场景："新需求"、"需求分析"、"PRD 拆解"、"产出 spec"、"产出 tasks"。把用户原始需求转成结构化的 spec.md + tasks.md，保证后续步骤有清晰契约。
---

# Skill: request-analysis

## 何时触发
- 用户给出新需求；或评审循环要求修订。

## 输入
- 用户原始需求（自然语言）
- 该 change 目录路径
- L1 Rules（已常驻）；按需查 `.harness/wiki/`

## 步骤
1. **复述确认**：1 段话复述需求，明确「目标用户 / 业务价值 / 关键场景」。
2. **澄清假设**：列出所有不明确点，**禁止**自行推断。如有 ≥1 个 BLOCKING 假设，立刻向用户提问，不要写 spec。
3. **写 spec.md**（强制章节）：
   - **背景**：业务背景
   - **范围（In Scope）**：明确做什么
   - **非目标（Out of Scope）**：明确不做什么——这是阻止 Agent 顺手过度重构的关键
   - **核心场景**：用户故事 / 数据流
   - **验收标准**：可测试的断言列表
   - **风险与权衡**
4. **写 tasks.md**（每个 task 五要素）：
   - 目标（Goal）
   - 输入（Inputs）
   - 输出（Outputs）— 文件路径或可观测变化
   - 验收（Acceptance）— 可程序化校验
   - 依赖（Depends-on）— 其他 task ID

## 输出
- `request_analysis/spec.md`
- `request_analysis/tasks.md`
- 更新 `summary.md` 步骤 1 状态为 `DONE`

## 反模式（不要做）
- ❌ "我先实现一个 MVP，详情后续讨论"——必须先写完整 spec。
- ❌ 用"请确保性能良好"这种不可校验的验收标准。
- ❌ 把"重构 + 新功能 + 国际跳转"塞进同一个 change。

## Checklist
- [ ] spec.md 含 6 个强制章节
- [ ] 每个 task 含五要素
- [ ] 验收标准全部可程序化校验（命令、文件、测试结果等）
- [ ] 「非目标」章节非空
