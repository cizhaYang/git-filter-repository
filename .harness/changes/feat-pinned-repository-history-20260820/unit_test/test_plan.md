# 固定仓库历史测试计划

## 改动与测试映射

| 改动文件 | 测试文件/验证 | 覆盖方式 |
|---|---|---|
| `src/domain/pinnedRepositoryHistory.ts` | `test/unit/pinnedRepositoryHistory.test.cjs` | 直接测试纯函数行为 |
| `src/extension.ts` | domain 纯计划测试 + `test/unit/extensionManifest.test.cjs` + `npm run check` | VS Code API 留在薄装配层，不全局 patch `vscode` |
| `package.json` | `test/unit/extensionManifest.test.cjs` | 命令存在、标题栏挂载与 group 契约 |
| `.harness/wiki/architecture.md` | `npm run harness:doctor` | 命令文档漂移检查 |
| `README.md`、`.harness/wiki/domain-model.md` | `git diff --check` + 人工语义复核 | 文档不执行运行时行为 |

## 用例矩阵

### Happy Path

1. 合并已有历史与当前工作区固定项，保持原顺序并追加新项。
2. 删除指定历史项后保留其它历史项。
3. 导入计划把唯一匹配项标记为 `matched`。
4. manifest 注册 `scmRepositoryFilter.manageRepositoryHistory` 并挂载 Changed Repositories 标题栏。

### Edge Case

1. 全局状态不是数组时返回空历史。
2. 数组中的非字符串、空字符串、不同分隔符和重复项被安全过滤/规范化。
3. 未匹配历史标记为 `notFound` 且候选为空。
4. 同一后缀匹配多个仓库时保留全部候选并标记 `ambiguous`。
5. 当前工作区已经固定的历史项标记为 `pinned`。

### Regression

1. 历史使用短后缀、当前配置使用完整相对路径时，通过实际匹配根识别为已固定，防止重复导入。
2. 命令同时存在于 manifest 与扩展注册点，防止只有按钮没有处理器或只有处理器没有入口。

## 非测试范围

- 不启动真实 Extension Development Host，不全局 mock `vscode` Quick Pick 生命周期。
- 不访问真实 Git 仓库；仓库根路径均为纯字符串样例。
- Quick Pick 的删除只调用 `globalState`、导入只更新 workspace 配置的边界由代码评审检查装配层调用路径。

## CI 命令

```bash
npm run check
npm run build
npm test
npm run harness:doctor
git diff --check
```

门禁：所有命令退出码 0，`npm test` 的 passed 数大于 0。
