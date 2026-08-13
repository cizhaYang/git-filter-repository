---
name: coding-skill
description: 步骤 2 — 编码实现。触发场景："写代码"、"实现 feature"、"开发功能"、"改动视图"。基于 spec/tasks 按三层 Spec 完成代码变更，产出 coding_report 并通过 typecheck 门禁。
---

# Skill: coding-skill

## 何时触发
步骤 1 完成 + 用户确认进入实现。

## 输入
- `spec.md` + `tasks.md`
- L1 Rules（已加载）
- 分层规范：`./specs/01-domain-spec.md`、`02-git-spec.md`、`03-view-spec.md`、`04-extension-spec.md`

## 工作流（每个 task 重复）

```
load specs/{layer}-spec.md   # 按本 task 影响层加载，**不要全部加载**
read existing code in target layer
plan minimal diff
write code following spec
run: npm run check     # 必须绿
write coding_report entry
```

## 输出
- 代码变更（最小必要 diff）
- `coding/coding_report_v{n}.md`，含：
  - 改动文件列表（相对路径 + 行数）
  - 新增/删除的公共出口（Provider 方法 / 命令）
  - 关键决策（为什么这样做、放弃了什么方案）
  - 已知限制 / 后续工作

## 硬性约束（重申，由 code-review 校验）

- Git 命令只经 `src/git/`；view / domain **禁止** `spawn/exec`。
- `domain/`、`git/` 不 import `vscode`（可测试性）；`domain/`、`git/` 不 import `views/`。
- 新增命令必须在 `package.json` contributes 与 `extension.ts` 中**同时**注册。
- 长任务背景化：`withProgress` / 事件驱动 / 并发上限，禁止阻塞 Extension Host 主线程。
- 状态缓存对账在事件闭环内完成，Provider 只做「缓存 → TreeItem」映射。

## 反模式
- ❌ 顺手把 spec 之外"看起来不规范"的代码也改了——另开 change。
- ❌ 在 view 里直接拼 `git ...` shell 命令——应改在 `src/git/` 层封装并加单测。
- ❌ 把慢 Git 操作放在 `getChildren` 同步执行——应预取/缓存 + `fireTreeDataChanged`。

## Checklist
- [ ] `npm run check` 退出码 0
- [ ] coding_report 列出全部改动文件
- [ ] 改动未触碰 spec 之外的模块
- [ ] 三层依赖方向合规（domain/git 不 import vscode、不反向依赖 views）
