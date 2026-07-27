# SCM Repository Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 VS Code Source Control 侧边栏视图，只显示当前有本地修改的 Git 仓库，并为后续 Git 操作预留结构。

**Architecture:** 以 VS Code 内置 Git 扩展作为唯一仓库来源，先封装一个很薄的 Git API 适配层，再用纯函数判断仓库是否“有改动”，最后由 `TreeDataProvider` 负责过滤和渲染。这样可以让“仓库发现 / 状态判断 / UI 展示”三层分开，后续加 `pull / commit / push` 时只需要在现有仓库节点上加命令，不用重做数据流。

**Tech Stack:** TypeScript、VS Code Extension API、Node.js、esbuild、Vitest。

---

## 文件结构

```text
.
├── .gitignore
├── .vscodeignore
├── package.json
├── tsconfig.json
├── esbuild.mjs
├── src/
│   ├── extension.ts
│   ├── git/
│   │   └── gitExtension.ts
│   ├── domain/
│   │   └── repositoryState.ts
│   └── views/
│       ├── changedRepositoriesProvider.ts
│       └── repositoryTreeItem.ts
├── test/
│   └── unit/
│       ├── repositoryState.test.ts
│       └── changedRepositoriesProvider.test.ts
└── resources/
    └── scm-repository-filter.svg
```

职责划分：

- `src/extension.ts` 负责激活、注册命令和挂载视图。
- `src/git/gitExtension.ts` 只负责拿到 VS Code Git 扩展 API，隔离版本差异。
- `src/domain/repositoryState.ts` 只负责“是否有改动”和“改动数量”这种纯逻辑。
- `src/views/changedRepositoriesProvider.ts` 负责订阅仓库变化、过滤 dirty 仓库、触发刷新。
- `src/views/repositoryTreeItem.ts` 负责把仓库数据转成 TreeItem。

---

### Task 1: 搭建插件骨架和 Source Control 视图入口

**Files:**
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.mjs`
- Create: `resources/scm-repository-filter.svg`
- Create: `src/extension.ts`
- Create: `test/unit/extensionManifest.test.ts`

- [ ] **Step 1: 先写会失败的清单测试**

```ts
import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

describe('extension manifest', () => {
  it('把仓库过滤视图挂到 Source Control 容器', () => {
    expect(manifest.main).toBe('./dist/extension.js');
    expect(manifest.contributes.views.scm[0].id).toBe('scmRepositoryFilter.changedRepositories');
    expect(manifest.contributes.views.scm[0].name).toBe('Changed Repositories');
    expect(manifest.activationEvents).toContain('onView:scmRepositoryFilter.changedRepositories');
  });
});
```

- [ ] **Step 2: 运行测试确认当前肯定失败**

Run: `npm test -- --run test/unit/extensionManifest.test.ts`

Expected: 失败，原因是项目还没有 `package.json`、测试脚本或构建产物。

- [ ] **Step 3: 写最小可运行插件骨架**

`package.json` 需要把视图直接贡献到 Source Control 容器，而不是自己造一个新的侧边栏容器。关键内容如下：

```json
{
  "name": "scm-repository-filter",
  "displayName": "SCM Repository Filter",
  "publisher": "local",
  "version": "0.1.0",
  "engines": { "vscode": "^1.95.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onView:scmRepositoryFilter.changedRepositories"],
  "contributes": {
    "views": {
      "scm": [
        {
          "id": "scmRepositoryFilter.changedRepositories",
          "name": "Changed Repositories"
        }
      ]
    },
    "commands": [
      {
        "command": "scmRepositoryFilter.refresh",
        "title": "Refresh Changed Repositories"
      },
      {
        "command": "scmRepositoryFilter.openRepository",
        "title": "Open Repository"
      }
    ],
    "viewsWelcome": [
      {
        "view": "scmRepositoryFilter.changedRepositories",
        "contents": "No changed repositories were found."
      }
    ]
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "test": "vitest",
    "check": "tsc --noEmit"
  }
}
```

`src/extension.ts` 先只注册命令和 provider，业务逻辑之后再补：

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('scmRepositoryFilter.refresh', () => undefined),
    vscode.commands.registerCommand('scmRepositoryFilter.openRepository', () => undefined),
  );
}

export function deactivate(): void {}
```

`esbuild.mjs` 负责把 `src/extension.ts` 打成 `dist/extension.js`，`tsconfig.json` 开启 `strict`、`noUncheckedIndexedAccess`、`resolveJsonModule`。

- [ ] **Step 4: 安装依赖并让骨架跑起来**

Run: `npm install`

Run: `npm run check && npm run build && npm test -- --run test/unit/extensionManifest.test.ts`

Expected: 类型检查通过、构建生成 `dist/extension.js`、清单测试通过。

- [ ] **Step 5: 提交骨架**

```bash
git add .gitignore .vscodeignore package.json package-lock.json tsconfig.json esbuild.mjs resources/scm-repository-filter.svg src/extension.ts test/unit/extensionManifest.test.ts
git commit -m "chore: scaffold scm repository filter extension"
```

---

### Task 2: 提炼仓库改动判断逻辑

**Files:**
- Create: `src/domain/repositoryState.ts`
- Create: `test/unit/repositoryState.test.ts`

- [ ] **Step 1: 先写纯函数测试**

```ts
import { describe, expect, it } from 'vitest';
import { countRepositoryChanges, hasRepositoryChanges } from '../../src/domain/repositoryState';

describe('repositoryState', () => {
  it('把任意 index、working tree、merge 改动都算作有修改', () => {
    expect(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [], mergeChanges: [] })).toBe(false);
    expect(hasRepositoryChanges({ indexChanges: [{}], workingTreeChanges: [], mergeChanges: [] })).toBe(true);
    expect(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [{}], mergeChanges: [] })).toBe(true);
    expect(hasRepositoryChanges({ indexChanges: [], workingTreeChanges: [], mergeChanges: [{}] })).toBe(true);
  });

  it('把三类改动数量加总', () => {
    expect(countRepositoryChanges({
      indexChanges: [{}, {}],
      workingTreeChanges: [{}],
      mergeChanges: [{}, {}],
    })).toBe(5);
  });
});
```

- [ ] **Step 2: 跑测试确认当前还没有实现**

Run: `npm test -- --run test/unit/repositoryState.test.ts`

Expected: 失败，提示函数未实现。

- [ ] **Step 3: 实现最小纯逻辑**

```ts
export interface RepositoryLikeState {
  indexChanges: unknown[];
  workingTreeChanges: unknown[];
  mergeChanges: unknown[];
}

export function hasRepositoryChanges(state: RepositoryLikeState): boolean {
  return countRepositoryChanges(state) > 0;
}

export function countRepositoryChanges(state: RepositoryLikeState): number {
  return state.indexChanges.length + state.workingTreeChanges.length + state.mergeChanges.length;
}
```

- [ ] **Step 4: 跑测试并确认通过**

Run: `npm test -- --run test/unit/repositoryState.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交这层逻辑**

```bash
git add src/domain/repositoryState.ts test/unit/repositoryState.test.ts
git commit -m "feat: add repository change helpers"
```

---

### Task 3: 接入 VS Code Git 扩展并过滤 dirty 仓库

**Files:**
- Create: `src/git/gitExtension.ts`
- Create: `src/views/changedRepositoriesProvider.ts`
- Create: `src/views/repositoryTreeItem.ts`
- Update: `src/extension.ts`
- Create: `test/unit/changedRepositoriesProvider.test.ts`

- [ ] **Step 1: 先写 provider 过滤测试**

```ts
import { describe, expect, it } from 'vitest';
import { getChangedRepositories } from '../../src/views/changedRepositoriesProvider';

describe('changedRepositoriesProvider', () => {
  it('只返回有改动的仓库', () => {
    const repos = [
      { name: 'clean', rootUri: '/repo/clean', state: { indexChanges: [], workingTreeChanges: [], mergeChanges: [] } },
      { name: 'dirty', rootUri: '/repo/dirty', state: { indexChanges: [{ uri: 'a' }], workingTreeChanges: [], mergeChanges: [] } },
    ];

    expect(getChangedRepositories(repos).map((repo) => repo.name)).toEqual(['dirty']);
  });
});
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `npm test -- --run test/unit/changedRepositoriesProvider.test.ts`

Expected: 失败，提示 provider 过滤函数未实现。

- [ ] **Step 3: 实现 Git API 适配和 TreeDataProvider**

`src/git/gitExtension.ts` 只做一件事：激活 `vscode.git` 并返回 `getAPI(1)` 的结果。这样后面如果 Git 扩展 API 版本变化，只改这一层。

`src/views/changedRepositoriesProvider.ts` 需要：

```ts
export function getChangedRepositories(repositories: RepositoryLike[]): RepositoryLike[] {
  return repositories.filter((repository) => hasRepositoryChanges(repository.state));
}
```

并且用 `EventEmitter` 在以下场景刷新：

- Git 仓库状态变化
- 仓库列表变化
- 手动刷新命令触发

`src/views/repositoryTreeItem.ts` 把仓库名、相对路径和变更数量显示出来，点击命令打开仓库根目录。

- [ ] **Step 4: 跑测试并做一次手动验证**

Run: `npm run check && npm test`

Expected: 过滤测试通过，provider 能只显示 dirty 仓库。

手动验证：

1. 用 VS Code 打开一个包含多个嵌套仓库的工作区。
2. 修改其中一个仓库中的文件。
3. 确认 Source Control 新增的 `Changed Repositories` 里只出现有改动的仓库。
4. 还原修改后，这个仓库从视图里消失。

- [ ] **Step 5: 提交视图接入**

```bash
git add src/git/gitExtension.ts src/views/changedRepositoriesProvider.ts src/views/repositoryTreeItem.ts src/extension.ts test/unit/changedRepositoriesProvider.test.ts
git commit -m "feat: show changed git repositories"
```

---

### Task 4: 补齐空状态、日志和最终回归

**Files:**
- Update: `src/views/changedRepositoriesProvider.ts`
- Update: `package.json`
- Optional: `README.md`

- [ ] **Step 1: 补空状态文案和错误分支**

把以下情况讲清楚：

- Git 扩展没启用时，视图为空且有提示。
- 当前没有 dirty 仓库时，视图为空且有提示。
- 单个仓库状态读取失败时，记录日志但不影响其他仓库。

- [ ] **Step 2: 做最终回归**

Run:

```bash
npm run check
npm run build
npm test
```

Expected: 全部通过。

- [ ] **Step 3: 提交收尾**

```bash
git add package.json src/views/changedRepositoriesProvider.ts README.md
git commit -m "docs: finish scm repository filter first version"
```

## 自查结果

- 需求覆盖：视图挂到 Source Control、只显示有改动仓库、自动刷新、手动刷新、后续可扩展，都有对应任务。
- 占位符扫描：没有 `TODO`、`TBD`、`implement later` 这种空话。
- 类型一致性：`hasRepositoryChanges`、`countRepositoryChanges`、`getChangedRepositories` 的命名和调用顺序保持一致。
- 范围控制：第一版没有把 commit/pull/push 拉进来，避免把一个过滤插件做成完整 Git 客户端。
