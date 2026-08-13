---
name: frontend-doctor
description: 任意阶段卡死、typecheck 失败、单测反复失败、构建报错时的系统化诊断。触发场景："构建挂了"、"测试 flaky"、"莫名其妙 check 红"、"排查问题"。按 5 步法定位根因，禁止"再试一次"式盲修。（沿用参考 Harness 命名；本扩展无前端浏览器，语义=扩展诊断。）
---

# Skill: frontend-doctor

## 何时触发
- 同一阶段连续失败 ≥ 2 次
- 单测随机失败（同一用例时而过、时而不）
- "本地能跑，CI 跑不过"
- `npm run build` 产物异常

## 反模式
- ❌ "我再跑一次试试"——不知道根因就别复跑。
- ❌ "升级一下依赖看看"——升级前先复现并定位最小用例。

## 5 步诊断法

### 1. 复现到最小用例
- 先确认能稳定复现（≥3 次失败 / 5 次尝试）。
- 隔离变量：`git stash` 干净 worktree、不同 Node 版本、关掉 dist 缓存（`rm -rf dist .vscode-test`）。

### 2. 二分查找
- `git bisect` 定位首个引入失败的提交。
- 若主怀疑是编译层，清 `dist/` 后重 build；若主怀疑是单测，只跑对应用例 `node --test test/unit/<name>.test.cjs`。

### 3. 收集证据
| 现象 | 收集物 |
|---|---|
| 测试失败 | `npm test` 全文（含 stack） |
| typecheck 失败 | `npm run check 2>&1 \| head -50` |
| 单测 flaky | 重跑 N 次的通过率、是否依赖前一条用例副作用 |
| 构建失败 | `npm run build` 完整日志 |
| 运行时错误 | Extension Development Host 的控制台 / 状态栏错误 |

### 4. 形成假设
写下：
- 假设：______
- 反证条件：如果 ______ 出现则假设错误
- 验证步骤：______

### 5. 修 Harness 而不仅是修代码
找到根因后，问：
- 这个失败是否能写成自动检查（`npm run check` / 单测 / Skill checklist / Rule 红线）？
- 是 → 把它编码进 `.harness/skills/*/Checklist` 或 `rules/*`，**让它再也不能发生**。

## Checklist
- [ ] 复现成功率记录（X/N 次）
- [ ] 至少 1 个反证条件被验证
- [ ] 修复同时更新某个 Skill / Rule 的 Checklist
- [ ] 在 change 的 `summary.md` 留下 root-cause 1 句话总结
