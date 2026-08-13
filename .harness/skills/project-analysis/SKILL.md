---
name: project-analysis
description: 第一次进入仓库或仓库结构变更后，对 .harness/ 体系与 src/ 三层（domain/git/views）做全景索引。触发场景包括："新人入场"、"项目分析"、"全局走读"、"梳理项目"。返回一份 ≤120 行的项目地图供后续阶段使用。
---

# Skill: project-analysis

## 何时触发
- 全新会话 + 该 change 还没有任何变更目录。
- `.harness/agents` 或 `.harness/rules` 有新提交。
- 用户主动要求"先帮我熟悉项目"。

## 输入
- 仓库根目录路径
- 上一次分析产出（若存在）：`.harness/wiki/architecture.md`

## 步骤
1. `find .harness -maxdepth 3 -name "*.md" | head -50`，建立 .harness/ 资源索引。
2. `ls src/{domain,git,views}`，按三层生成模块清单。
3. `cat src/extension.ts`，确认入口与 Provider/命令装配链路。
4. `grep -rn "registerCommand\|createTreeView" src/extension.ts`，列出全部扩展点。
5. `cat src/domain/repositoryState.ts`，定位状态缓存与对账逻辑。
6. `cat .harness/wiki/architecture.md` 比对实际代码与文档是否漂移；若差异 > 3 处，标记 `STALE`。

## 输出（结构强约束）
返回 Markdown，章节固定如下：

```
## 项目摘要
- 技术栈
- 架构（三层 + 入口）

## .harness/ 体系索引
- agents:
- rules:
- skills:
- wiki:

## src/ 模块清单
| 层 | 模块 | 职责 | 依赖方向 |

## 扩展点
- 视图: [...]
- 命令: [...]

## 文档漂移
- (若无写 NONE)

## 推荐阅读路径
1. ...
2. ...
```

## Checklist（评审依据）
- [ ] 输出 ≤120 行
- [ ] 模块清单覆盖 `src/{domain,git,views}` 下所有一级文件
- [ ] 文档漂移段落至少标注 NONE 或具体差异
- [ ] 扩展点清单与 `package.json` `contributes.commands` 交叉核对
