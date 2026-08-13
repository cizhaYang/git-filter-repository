# Rule: 工程结构（Project Structure）

> 这是不可商量的硬约束。Agent 创建/移动任何文件前**必须**先确认它落在正确的层。
> 本项目是 VS Code 扩展，不使用 FSD——依赖层为 `domain / git / views`。

## 1. 分层

```
src/
├── extension.ts       # 唯一入口：registerCommand / createTreeView / 装配 Provider
├── domain/            # 纯模型 + 决策逻辑（不依赖 vscode、不确定副作用）
│   ├── repositoryChangeFiles.ts
│   ├── repositoryQueries.ts
│   ├── repositoryState.ts
│   ├── changeOpenPlan.ts
│   ├── repositoryViewState.ts
│   ├── gitGraph.ts
│   └── repositoryActions.ts
├── git/               # Git 能力边界：CLI 封装、解析、仓库扫描
│   ├── localGitRepository.ts
│   ├── localGitRepositoryPaths.ts
│   ├── workspaceRepositoryScanner.ts
│   ├── gitBlobDocumentProvider.ts
│   ├── gitBlobDocumentStore.ts
│   ├── gitStatusParser.ts
│   └── gitCli.ts
└── views/             # TreeDataProvider + TreeItem + 视图状态
    ├── changedRepositoriesProvider.ts
    ├── changedFilesProvider.ts
    ├── changeGroupTreeItem.ts
    ├── repositoryTreeItem.ts
    ├── fileChangeTreeItem.ts
    └── repositorySelectionState.ts
```

## 2. 依赖方向

`views → git → domain`（以及 `extension.ts` 同时装配三者）

- **允许**：上层 import 下层。
- **禁止**：下层 import 上层。
- **禁止**：`domain/`、`git/`、`views/` 之间同层互相 import（兄弟模块通过上层协调）。
- `extension.ts` 是**唯一**允许同时依赖三层的装配点。

### 关键跨层通道

| 能力 | 唯一入口 |
|---|---|
| Git 操作 | `src/git/*`（`GitCli`、`LocalGitRepository`） |
| 状态缓存 / 仓库状态 | `src/domain/*`（`repositoryState.ts`、`repositoryQueries.ts`） |
| 事件闭环 | 由 Provider 持有状态缓存，文件事件 → 对账 → `fireTreeDataChanged` |

## 3. Git 命令 / 子进程归属（红线）

- 任何 `git <...>` 命令必须经 `src/git/` 层发出。
- `views/` 与 `domain/` **禁止**调用 `child_process` / `exec` / `spawn`。
- 状态缓存查不到/过期时，`domain` 通过依赖注入的查询回调触发刷新，**不**直接跑命令。

## 4. 文件命名

| 类型 | 风格 | 示例 |
|---|---|---|
| Provider / 类 | PascalCase | `ChangedRepositoriesProvider`、`LocalGitRepository` |
| 纯函数模块 | camelCase | `gitStatusParser.ts`、`repositoryQueries.ts` |
| TreeItem | `*TreeItem` 后缀 | `repositoryTreeItem.ts`、`fileChangeTreeItem.ts` |
| 测试 | `*.test.cjs`（编译后） | `test/unit/gitStatusParser.test.cjs` |

## 5. 扩展点注册

- `extension.ts` 中 `registerCommand` 的字符串必须与 `package.json` `contributes.commands[].command` **一致**。
- 新增视图/命令时，同步在 `wiki/architecture.md` 的「docs 漂移清单」登记（`harness-doctor` 会校验）。

## 6. 红线（Red Lines）

任一红线触发会被 `code-review` 直接 MUST FIX：

1. `domain/` 或 `git/` import `vscode`（破坏可测试性，除非该文件本身是 vscode 类型定义）。
2. `views/` 或 `domain/` 直接 `spawn/exec` Git 命令。
3. `git/` 或 `domain/` import `views/`（反向依赖）。
4. 同层模块互相 import 形成环（应提升到上层协调）。
5. 新增命令字符串与 `package.json` 不一致。
6. 长任务未背景化，阻塞 Extension Host 主线程（见 `coding-standard.md` §6）。
