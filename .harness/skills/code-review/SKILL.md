---
name: code-review
description: 步骤 3 静态代码检查。触发场景："代码检查"、"typecheck"、"三层红线检查"。在 expert-reviewer 之前先跑一遍机器化检查，把可被命令发现的问题清零。
---

# Skill: code-review

## 与 expert-reviewer 的分工
- **code-review（本 Skill）**：机器能发现的问题。typecheck、`npm test`、三层依赖方向、`package.json` 与 `extension.ts` 一致性。
- **expert-reviewer**：机器发现不了的问题。语义错误、契约不一致、事件闭环缺陷。

> **OpenAI 经验**：把所有"能机器化"的检查放最前面（"Waiting is expensive, fixing is cheap"）。

## 输入
- 当前 git diff
- L1 Rules

## 步骤（按顺序，遇到失败立即返回）

```bash
# 1. typecheck
npm run check

# 2. 单测（暴露解析/缓存回归）
npm test

# 3. 三层依赖方向（手工核对，无独立脚本——红线集中在 rules/project-structure.md）
#    grep 确认：domain/ 与 git/ 未 import vscode；views/ 与 domain/ 未 spawn；无 git/domain import views/
grep -rnE "^import .*from ['\"](vscode|child_process)['\"]" src/domain src/git 2>/dev/null || true

# 4. 命令一致性：package.json contributes 与 extension.ts registerCommand 交叉比对
node -e "const p=require('./package.json');const h=require('node:fs').readFileSync('src/extension.ts','utf8');p.contributes.commands.forEach(c=>{if(!h.includes(c.command))console.error('MISSING in extension.ts:',c.command)})"
```

## 三层依赖方向检查清单

- [ ] `domain/` `git/` 无 `import vscode`（打破可测试性）
- [ ] `views/` `domain/` 无 `spawn` / `exec` / `child_process`（Git 命令只经 `src/git`）
- [ ] `git/` `domain/` 不 import `views/`（无反向依赖）
- [ ] `extension.ts` 是唯一同时依赖三层的装配点
- [ ] 所有 `registerCommand` 字符串在 `package.json` `contributes.commands` 中

## 输出
- `coding/review/code_review_v{n}.md`，列出每条命令的退出码、输出摘要、违规位置。

## Checklist
- [ ] 全部命令退出码 0
- [ ] `npm test` 用例数 > 0
- [ ] 三层依赖方向 0 违规
- [ ] 命令清单 0 遗漏
