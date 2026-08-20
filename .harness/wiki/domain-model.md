# Domain Model

> 真源是 `src/domain/*.ts` 中的类型。本文档为可读视图。

## RepositoryChangeGroup

`'index' | 'workingTree' | 'merge' | 'untracked'`（union，**禁止 enum**）

四种来源与 VS Code Git 扩展状态一致；`hasRepositoryChanges` 四类都计入，避免未跟踪文件被过滤。

## RepositoryLikeState

| 字段 | 类型 | 说明 |
|---|---|---|
| indexChanges | `GitChangeLike[]` | 已暂存（Staged） |
| workingTreeChanges | `GitChangeLike[]` | 工作区未暂存 |
| mergeChanges | `GitChangeLike[]` | 合并/冲突 |
| untrackedChanges | `GitChangeLike[]?` | 未跟踪（可选，兼容旧数据） |

## RepositoryChangeFile

| 字段 | 类型 | 说明 |
|---|---|---|
| group | RepositoryChangeGroup | 所属分组 |
| label | string | 展示名 |
| change | GitChangeLike | 保留原始 change，复用 Git diff |
| command | unknown? | 可执行指令 |

分组顺序固定：`index → workingTree → merge → untracked`（对应 VS Code Changes 阅读顺序）；默认隐藏空分组。

## ChangeOpenPlan（打开变更的决策）

`type: 'command' | 'diff' | 'openFile' | 'unavailable'`。CLI 无 VS Code 的 `~` 与空 ref 约定——`getGitBlobRef` 把 `''`/`'~'` 归一到 `':'` 表示 index 内容。

## RepositoryViewState（视图态）

- `workspaceAvailable`: 是否有工作区
- `gitAvailable`: Git CLI 是否可用
- 文案区分「打开工作区 / 无 Git / 确实无改动」，不把环境错误误报成"没有改动"。

## PinnedRepositoryHistoryImportItem

`src/domain/pinnedRepositoryHistory.ts` 对全局历史路径与当前工作区扫描结果的纯匹配计划：

| 字段 | 类型 | 说明 |
|---|---|---|
| historyPath | string | 规范化后的用户级历史路径 |
| status | `'pinned' \| 'matched' \| 'ambiguous' \| 'notFound'` | 当前工作区中的导入状态 |
| candidateRoots | string[] | 唯一匹配根或歧义候选；未匹配为空 |

历史的读写留在 `extension.ts` 的 `globalState` 薄壳；domain 只负责未知值过滤、稳定去重、删除决策和导入分类。

## 业务规则（隐性约束）

- 仓库是否 dirty 由 4 类变更总和决定，未跟踪也算。
- 仓库显示名统一由根目录生成（`getRepositoryDisplayName`），不依赖可能缺失的 name 字段。
- 过滤 / 分组 / 视图文案逻辑都是**纯函数**，不依赖 vscode —— 可直接 `test/unit` 单测。
