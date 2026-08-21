# 编码实现报告 v1

## 改动文件

- `src/git/gitCli.ts`：增加 stash push/list/apply argv 封装、NUL 格式解析和 `GitStashEntry` 类型。
- `src/git/localGitRepository.ts`：将 stash 能力暴露给 `GitRepositoryLike`。
- `src/domain/repositoryActions.ts`：增加 `hasTrackedChangesForStash`纯判断，只认定 tracked/index/merge 改动。
- `src/extension.ts`：注册 ellipsis 命令，编排 Stash message 输入、Apply 列表选择、进度、错误反馈和失败后刷新。
- `package.json`：增加 `scmRepositoryFilter.repositoryMoreActions` 及两类仓库行 inline `$(ellipsis)` 入口。
- `.harness/wiki/architecture.md`：登记新命令扩展点。
- `test/unit/gitCli.test.cjs`：覆盖 stash argv、特殊描述解析、空列表和损坏输出。
- `test/unit/repositoryActions.test.cjs`：覆盖 tracked 与 untracked-only 判断。
- `test/unit/extensionManifest.test.cjs`：覆盖 ellipsis 命令、两类仓库 context 和 inline 顺序。

## 公共出口

- `GitCli.stash(rootPath, message)`
- `GitCli.listStashes(rootPath)`
- `GitCli.applyStash(rootPath, ref)`
- `GitStashEntry { ref, description }`
- `GitRepositoryLike.stash/listStashes/applyStash`
- `hasTrackedChangesForStash(repository)`
- `scmRepositoryFilter.repositoryMoreActions`

## 关键决策

- 用一个 ellipsis inline 按钮打开 Quick Pick，避免为两个 stash 操作各占一个仓库行按钮。
- stash 列表使用 `%gd%x00%gs%x00`，不按冒号拆分描述；每个用户输入值都作为单独 argv 传入子进程。
- Apply 保留 stash，且在成功和冲突失败后都调度状态刷新。

## 门禁证据

- `npm run check`：通过。
- `npm run build`：通过。
- 新增定向测试：27 用例通过（后续又补充了损坏 stash 输出用例）。
