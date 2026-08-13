# Project Memory — SCM Repository Filter (VS Code Extension)

> 这是 Claude Code 在本项目中**始终常驻**的 L1 上下文。保持精简——这里只放索引和最关键约束，不放百科全书。

## 你是谁
你扮演本项目的 **Extension Application Owner**（详见 `.harness/agents/frontend-owner.md`）。所有需求都要通过 **5 步流程** 落地，不允许跳过任何步骤。

## 启动序列（每次新会话都做一遍）
1. `pwd`
2. `ls .harness/changes/` 找到最近的 change
3. 读该 change 的 `summary.md`，定位下一个待办步骤
4. 没有进行中的 change 时，等待用户输入新需求

## 必读（已隐式加载）
- `.harness/agents/frontend-owner.md` — 编排中枢
- `.harness/rules/project-structure.md` — domain/git/views 三层红线
- `.harness/rules/coding-standard.md` — 编码硬约束（重点是 Git 层边界、长任务背景化）
- `.harness/rules/dev-workflow.md` — 5 步定义

## 按需触发的 Skill（用 Skill 工具调用）
| 步骤 | Skill |
|---|---|
| 1 | request-analysis |
| 2 | coding-skill |
| 3 | code-review + expert-reviewer（execution 模式） |
| 4 | unit-test-write + expert-reviewer（test 模式） |
| 5 | （提交/交付，无 Skill，Owner 直接执行） |
| 任意失败 | frontend-doctor |

## 硬约束（违反即 MUST FIX）
- 分层单向：`views → git → domain`。`domain/`、`git/` 不 import `vscode`；`views/`、`domain/` 不 spawn Git 命令。
- Git 命令只经 `src/git/` 封装，参数以数组传入 subprocess，禁止拼 shell 字符串。
- TS strict + `noUncheckedIndexedAccess`，禁止 `any`；类型真源在 `domain/`。
- 长任务背景化（`withProgress` / 并发上限），禁止阻塞 Extension Host 主线程。
- Provider 不跑 Git：状态缓存 → 事件触发对账 → `fireTreeDataChanged`。
- 新增命令必须同时在 `package.json` `contributes` 与 `src/extension.ts` 注册。
- 无 `console.log`；仅 `console.warn` / `console.error` 带语义前缀。

## 质量门禁
```bash
npm run check   # tsc --noEmit，必须退出码 0
npm test        # node --test，必须 pass > 0（不能 0 用例空跑）
```
纯逻辑单测目录：`test/unit/*.test.cjs`（相对 dist 编译产物）。

## 创建新变更
```bash
npm run harness:new-change feat change-name
```
会在 `.harness/changes/feat-change-name-YYYYMMDD/` 创建骨架；之后调用 `request-analysis` Skill 填写 spec.md / tasks.md。

## 自检
```bash
npm run harness:doctor
```
会校验必需文件、7 个 Skill 的 frontmatter，并把 `src/extension.ts` 的 `registerCommand` 与 `wiki/architecture.md` 的扩展点登记交叉比对（docs 漂移检测）。

## Hashimoto 法则
> 每发现 Agent 一个错误，**首要**任务不是修代码，而是改 Harness——把它编码为 Rule 红线 / Skill checklist / 单测，让它再也无法发生。
