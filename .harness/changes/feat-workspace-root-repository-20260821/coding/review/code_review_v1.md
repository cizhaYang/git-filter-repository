# 代码评审 v1

- **mode**：execution
- **verdict**：REVISION REQUIRED

## MUST FIX

### 1. all 模式会用递归扫描结果覆盖常驻仓库

- **位置**：`src/views/changedRepositoriesProvider.ts` 的 `refreshRepositories`
- **问题**：递归扫描结果未显式合并手动固定仓库和已确认主仓库；扫描漏项或整体失败时会清空本应常驻的条目。
- **建议**：发布前合并“递归结果 ∪ 主仓库 ∪ 手动固定仓库”，并补漏项/失败回归测试。
- **分级**：MUST FIX

### 2. 工作区根浅扫描缺少逐根错误降级

- **位置**：`src/git/workspaceRepositoryScanner.ts` 的 `scanWorkspaceRoots`
- **问题**：任一根的 `getPathType` 抛错会终止整个多根扫描；原生文件系统还把权限错误静默折叠为 `missing`。
- **建议**：只把 `ENOENT/ENOTDIR` 当作缺失，其余错误逐根记录并继续；补多根失败隔离和日志测试。
- **分级**：MUST FIX

## SHOULD

### 3. Unpin 命令守卫应复用主仓库排除逻辑

- **位置**：`src/views/changedRepositoriesProvider.ts` 的 `isPinnedRoot`
- **问题**：旧配置包含 `.` 时，UI 是普通仓库，但命令守卫仍可能把根仓库视为 pinned。
- **建议**：让 `isPinnedRoot` 与渲染共用排除主仓库后的集合并补测试。
- **分级**：SHOULD

## INFO

- 未发现新增 `any`、`console.log`、视图层 Git 子进程、反向依赖或命令清单漂移。
- 第 1 轮机器门禁通过，但测试尚未覆盖以上契约缺口。
