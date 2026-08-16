# CI Summary — feat-custom-repository-list-20260813

> Step 4 测试与 CI 最终结果。测试评审（expert test 模式）APPROVED；评审建议的 SHOULD/LOW 补测本次落地。

## 质量门禁结果（最终）

| 命令 | 结果 |
|---|---|
| `npm run check`（tsc --noEmit） | **exit 0** ✅ |
| `npm test`（node --test） | **82 / 82 pass, 0 fail** ✅ |
| `npm run harness:doctor` | **0 errors, 0 warnings** ✅ |
| 测试评审 verdict（expert test 模式） | **APPROVED**（0 MUST FIX）✅ |

## 测试规模

- 新增/修改测试文件：`pinnedRepositories.test.cjs`（19 例）、`changedRepositoriesPinnedMode.test.cjs`（7 例）、`repositoryTreeItem.test.cjs`（3 例 / 新增）、`changedRepositoriesWorkspaceProvider.test.cjs`、`changedRepositoriesRefreshScheduler.test.cjs`（stub 修补回归）。
- 全量从**65 → 82** 用例，覆盖：
  - domain 匹配/合并/越界防护/持久化决策
  - pinned 模式免全量扫 + 配置切换 + shallow discover
  - all 模式改动∪固定合并 + 空态消息
  - TreeItem pin 图标/contextValue 渲染

## 评审建议落地（SHOULD/LOW）

评审（test 模式）在 APPROVED 基础上提出 5 条非阻断建议，本次全部或大部分落地：

| 建议 | 处置 |
|---|---|
| [SHOULD] `resolvePinnedRootsFromRelative` 补反斜杠（`..\\..\\etc`）与混合合法/越界列表回归测试 | ✅ 已加 2 条用例 |
| [SHOULD] `pinRepository`/`unpinRepository` 持久化路径无行为测试 | ✅ 抽纯函数 `nextPinnedRelativePaths` / `removePinnedRelativePath` 并各加 happy/edge 用例 |
| [SHOULD] `discoverRepositoryRoots` 模式分支（pinned=shallow）无断言 | ✅ 已加测试断言 pinned 只走 `scanWorkspaceRoots`、不走全量 `scan` |
| [LOW] all→pinned 卸载方向未测 | ⚠️ 运行时已验证（mode 切换测试覆盖 pinned→all 重建；卸载由 `uninstallWorkspaceWatchers` 代码 + Round3 复核确认），未加独立卸载断言（无公开访问器，避免为测试暴露内部） |
| [INFO] (既有) `package.json` `test:unit` 脚本在 Node 22 用 `node --test test/unit` 报错 + 重复行 | ⚠️ 属**既有**问题（HEAD 即存在），非本 feature 引入；门禁 `npm test` 正常通过。未在本 change 修改（scope 外），建议另开 change 修 `test:unit` 为 glob 形式并去重 |

## 结论

工程实现 + 测试 + 评审全部收口。`npm run check` + `npm test` 双门禁全绿，评审两阶段（代码 3 轮 APPROVED + 测试 1 轮 APPROVED）无未决 MUST FIX。可进入 Step 5 提交与交付。
