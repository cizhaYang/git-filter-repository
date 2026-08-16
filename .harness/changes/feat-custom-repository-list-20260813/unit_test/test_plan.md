# Test Plan — feat-custom-repository-list-20260813

> Step 4 测试计划：改动驱动测试（Change-driven）。列出每个改动文件 → 测试文件的映射、用例类别、覆盖点。

## 改动文件 ↔ 测试文件映射

| 改动源文件 | 测试文件 | 用例数 | 类别 |
|---|---|---|---|
| `src/domain/pinnedRepositories.ts` (新增) | `test/unit/pinnedRepositories.test.cjs` | 12 | happy + edge + regression |
| `src/views/changedRepositoriesProvider.ts` (改) | `test/unit/changedRepositoriesPinnedMode.test.cjs` | 6 | happy + edge |
| 〃 | `test/unit/changedRepositoriesWorkspaceProvider.test.cjs` | 2 | happy(all 模式回归) |
| 〃 | `test/unit/changedRepositoriesRefreshScheduler.test.cjs` | 4 | 调度/对账回归（stub 修补） |
| `src/views/repositoryTreeItem.ts` (改) | `test/unit/repositoryTreeItem.test.cjs` (新增) | 3 | happy + edge |
| `src/extension.ts` (改) | `test/unit/extensionManifest.test.cjs` | 1 | 命令/配置一致性回归 |
| `package.json` (改) | `test/unit/extensionManifest.test.cjs` | 1 | 同上（scanMode/pinnedRepositories/命令） |

## 关键覆盖点（对照 spec 验收标准）

- **domain 匹配**：后缀唯一命中、多命中 ambiguous、无命中 notFound、空/重复模式、段边界误匹配（`afe/address` 不命中 `acme/address`）。
- **越界防护（评审 MUST FIX #2）**：`resolvePinnedRootsFromRelative` 拒绝 `../sibling`、`../../etc/passwd`、`originSource/../../outside`；空白跳过；无 workspace 根时为空；往返一致（add 命令存的相对路径能解析回同点）。
- **合并**：pinned 模式固定仓库零改动也渲染（`scanCalls===0` 证明不触发全量扫）；all 模式 改动∪固定 合并；固定条目 `pinnedRepository` contextValue。
- **配置变更即时生效**：pinned→all 模式切换触发全量扫描 + 重建集合。
- **消息空态**：pinned 空列表 → 提示文案；all 有固定无改动 → `undefined`（不报「没有改动仓库」）；all 无内容 → 空态文案。
- **TreeItem 渲染**：固定 → `$(pinned)` + `pinnedRepository`；非固定 → `$(repo)` + `changedRepository`；角标=改动数；command 指向 selectRepository。

## 测试环境约束

- 全部 `node --test test/unit/*.test.cjs`，相对 `dist/` 编译产物。
- `vscode` 依赖通过 `Module._load` 拦截注入 stub；stub 在单次加载内**单例复用**（修复 review 暴露的多 stub 错配 bug）。
- 无真实 Git / Extension Host；scanner / repositoryFactory / config 全部注入假实现。

## 覆盖率结论

- 新增 `pinnedRepositories.ts`（纯逻辑，安全敏感）→ 14 条断言级用例，含 traversal 攻击面。
- 新增 `repositoryTreeItem.ts` 的 `isPinned` 渲染（round 中缺口）→ 3 条用例补齐。
- provider 双模式/配置切换/消息空态 → `changedRepositoriesPinnedMode.test.cjs` 6 条。
- `npm test` 当前 **75/75 pass, 0 fail**，`npm run check` exit 0。
