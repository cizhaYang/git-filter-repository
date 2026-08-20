# Code Review v1

**模式：** execution

## 机器检查

| 检查 | 结果 |
|---|---|
| `npm run check` | PASS |
| `npm test` | PASS，106 passed / 0 failed |
| `git diff --check` | PASS |
| manifest 与 `registerCommand` 双向比对 | PASS，0 遗漏 |
| `domain/` 新模块依赖检查 | PASS，未 import `vscode`、未调用子进程 |

说明：全仓 `src/git/` 的 `vscode` 与 `child_process` 命中来自既有 `localGitRepository.ts`、`gitBlobDocumentProvider.ts` 和 `gitCli.ts`；本次未增加这些边界依赖。新命令已登记在 `package.json` 和 `.harness/wiki/architecture.md`。

## 评审意见

### MUST FIX：Quick Pick 异步写入失败没有用户可见处理

- **位置：** `src/extension.ts:594`、`src/extension.ts:605`、`src/extension.ts:619`
- **问题：** `onDidAccept`、`onDidTriggerButton` 和 `onDidTriggerItemButton` 使用 `void promise.then(...)`，但没有 `catch`。当 `workspace.getConfiguration().update` 或 `globalState.update` 失败时会产生未处理的 rejected Promise，且用户看不到导入或删除失败。
- **建议：** 事件回调包装为异步安全处理：执行期间设为 busy，`try/catch` 中写 Output Channel 并调用 `showErrorMessage`，最后恢复 busy；成功时才隐藏 Quick Pick 或刷新列表。
- **分级：** MUST FIX

## Verdict

**REVISION REQUIRED**
