# 多仓库 Git 管理 VS Code 插件实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从空目录构建一个跨平台 VS Code 插件，递归发现数百个独立 Git 仓库，聚合展示改动，并安全地完成单仓库 Diff、暂存、提交、Pull 和 Push。

**Architecture:** 系统 Git CLI 是唯一 Git 执行引擎，扩展宿主维护仓库索引、任务调度和安全校验；原生 TreeView 展示仓库与文件，WebviewView 承载单仓库详情和提交输入，VS Code 原生 Diff 编辑器展示代码差异。只读状态查询采用有限并发，写操作按仓库串行，安全 Pull 固定使用 `fetch + merge-tree 预检 + 条件 merge`。

**Tech Stack:** TypeScript、VS Code Extension API、Node.js `child_process`/`fs`、esbuild、Vitest、`@vscode/test-electron`、Mocha、系统 Git CLI。

---

## 文件结构

计划完成后的核心文件职责如下：

```text
.
├── .gitignore
├── .vscodeignore
├── package.json
├── tsconfig.json
├── esbuild.mjs
├── vitest.config.ts
├── resources/
│   └── multi-repo.svg
├── src/
│   ├── extension.ts                       # 扩展组合根与生命周期
│   ├── domain/
│   │   ├── repository.ts                  # 仓库、文件状态和操作结果类型
│   │   └── repositoryId.ts                # 跨平台稳定仓库 ID
│   ├── git/
│   │   ├── gitClient.ts                   # spawn Git、超时、退出码和版本能力
│   │   ├── parseStatus.ts                 # porcelain v2 -z 纯解析器
│   │   ├── gitStatusService.ts             # Git 状态到领域模型
│   │   ├── gitDiffService.ts               # HEAD/index/worktree 内容读取
│   │   └── gitOperationService.ts          # add/reset/commit/fetch/merge/push
│   ├── discovery/
│   │   ├── repositoryScanner.ts            # 可取消递归扫描与排除规则
│   │   └── repositoryIndex.ts              # 去重、归属、排序和缓存状态
│   ├── scheduling/
│   │   ├── asyncPool.ts                    # 全局只读有限并发
│   │   └── repositoryTaskScheduler.ts      # 单仓库写操作串行化
│   ├── watching/
│   │   └── workspaceWatcher.ts             # 文件事件归属、去抖和增量重扫
│   ├── views/
│   │   ├── repositoryTreeProvider.ts       # 原生仓库树
│   │   ├── repositoryDetailsView.ts        # 受限 WebviewView
│   │   ├── detailsHtml.ts                  # CSP HTML 与消息类型
│   │   └── diffContentProvider.ts          # Git 虚拟文档
│   ├── operations/
│   │   └── operationController.ts          # 命令校验、确认、执行与刷新
│   └── infrastructure/
│       ├── configuration.ts                # 配置读取与默认值
│       ├── output.ts                       # 脱敏 OutputChannel
│       └── workspaceCache.ts               # workspaceState 仓库路径缓存
├── test/
│   ├── unit/                               # 纯函数和调度单元测试
│   ├── integration/                        # 临时真实 Git 仓库测试
│   ├── vscode/                             # Extension Host 测试
│   └── helpers/
│       └── gitFixture.ts                   # 临时仓库、提交和远端夹具
└── docs/
    └── superpowers/
        ├── specs/2026-07-16-multi-repo-git-vscode-extension-design.md
        └── plans/2026-07-16-multi-repo-git-vscode-extension.md
```

所有新增方法、工具函数、组件和复杂分支都要补充解释业务原因或边界的注释；特别是 porcelain 字段、数量回显 key、嵌套仓库归属、文件事件去抖、安全 Pull 和 Webview 消息校验。样式不使用 `linear-gradient` 或 `display: inline-flex`，避免引入用户约束中禁止的跨端样式。

## Task 1：初始化 Git 仓库和可运行插件骨架

**Files:**
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.mjs`
- Create: `vitest.config.ts`
- Create: `resources/multi-repo.svg`
- Create: `src/extension.ts`
- Create: `test/unit/extensionManifest.test.ts`

- [ ] **Step 1：初始化仓库并写失败的清单测试**

Run: `git init`

Create `test/unit/extensionManifest.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

describe('extension manifest', () => {
  it('注册独立活动栏、仓库树和仓库详情视图', () => {
    expect(manifest.main).toBe('./dist/extension.js');
    expect(manifest.contributes.viewsContainers.activitybar[0].id).toBe('multiRepoGit');
    expect(manifest.contributes.views.multiRepoGit.map((view) => view.id)).toEqual([
      'multiRepoGit.repositories',
      'multiRepoGit.details',
    ]);
  });
});
```

- [ ] **Step 2：运行测试并确认因缺少插件清单失败**

Run: `npm test -- --run test/unit/extensionManifest.test.ts`

Expected: FAIL，提示找不到 `package.json`、Vitest 或测试脚本。

- [ ] **Step 3：创建最小插件工程**

`package.json` 必须包含：

```json
{
  "name": "multi-repo-git",
  "publisher": "multi-repo-tools",
  "displayName": "Multi-Repo Git",
  "description": "Discover and manage many independent Git repositories in one VS Code workspace.",
  "version": "0.1.0",
  "engines": { "vscode": "^1.95.0" },
  "categories": ["Source Control"],
  "activationEvents": ["onView:multiRepoGit.repositories"],
  "main": "./dist/extension.js",
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "check": "tsc --noEmit",
    "test": "vitest",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:vscode": "npm run build && node ./dist-test/runTest.js"
  },
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "multiRepoGit",
        "title": "Multi-Repo Git",
        "icon": "resources/multi-repo.svg"
      }]
    },
    "views": {
      "multiRepoGit": [
        { "id": "multiRepoGit.repositories", "name": "Repositories" },
        { "id": "multiRepoGit.details", "name": "Repository Details", "type": "webview" }
      ]
    },
    "commands": [
      { "command": "multiRepoGit.refreshAll", "title": "Multi-Repo Git: Refresh All" }
    ]
  },
  "devDependencies": {
    "@types/mocha": "^10.0.10",
    "@types/node": "^22.10.0",
    "@types/vscode": "^1.95.0",
    "@vscode/test-electron": "^2.4.1",
    "@vscode/vsce": "^3.2.1",
    "esbuild": "^0.24.0",
    "mocha": "^11.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

`src/extension.ts`：

```ts
import * as vscode from 'vscode';

/**
 * 扩展组合根。首个任务只验证扩展可以被加载，后续任务在这里注入扫描、视图和操作服务。
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('multiRepoGit.refreshAll', () => undefined),
  );
}

export function deactivate(): void {}
```

`esbuild.mjs` 将 `src/extension.ts` 打包为 Node 平台 CommonJS 的 `dist/extension.js`，并把 `vscode` 标记为 external；`tsconfig.json` 开启 `strict`、`noUncheckedIndexedAccess` 和 `resolveJsonModule`；`.gitignore` 至少忽略 `node_modules/`、`dist/`、`dist-test/`、`.superpowers/` 和 `*.vsix`。

- [ ] **Step 4：安装依赖并验证骨架**

Run: `npm install`

Run: `npm run check && npm run build && npm test -- --run test/unit/extensionManifest.test.ts`

Expected: TypeScript 无错误、生成 `dist/extension.js`、测试 PASS。

- [ ] **Step 5：提交插件骨架**

```bash
git add .gitignore .vscodeignore package.json package-lock.json tsconfig.json esbuild.mjs vitest.config.ts resources/multi-repo.svg src/extension.ts test/unit/extensionManifest.test.ts docs
git commit -m "chore: scaffold multi-repo git extension"
```

## Task 2：定义领域模型并解析 Git 状态

**Files:**
- Create: `src/domain/repository.ts`
- Create: `src/domain/repositoryId.ts`
- Create: `src/git/parseStatus.ts`
- Create: `test/unit/parseStatus.test.ts`
- Create: `test/unit/repositoryId.test.ts`

- [ ] **Step 1：为 porcelain v2 与仓库 ID 写失败测试**

`test/unit/parseStatus.test.ts` 覆盖普通修改、暂存、重命名、未跟踪、冲突和分支信息：

```ts
import { describe, expect, it } from 'vitest';
import { parsePorcelainV2 } from '../../src/git/parseStatus';

describe('parsePorcelainV2', () => {
  it('解析分支和 NUL 分隔的文件状态', () => {
    const raw = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/staged.ts',
      '1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa src/worktree.ts',
      '? src/新 文件.ts',
      'u UU N... 100644 100644 100644 100644 a a a a src/conflict.ts',
    ].join('\0') + '\0';

    const result = parsePorcelainV2(raw);

    expect(result.branch).toMatchObject({
      head: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    });
    expect(result.files.map(({ path, staged, unstaged, conflicted }) => ({
      path,
      staged,
      unstaged,
      conflicted,
    }))).toEqual([
      { path: 'src/staged.ts', staged: true, unstaged: false, conflicted: false },
      { path: 'src/worktree.ts', staged: false, unstaged: true, conflicted: false },
      { path: 'src/新 文件.ts', staged: false, unstaged: true, conflicted: false },
      { path: 'src/conflict.ts', staged: false, unstaged: false, conflicted: true },
    ]);
  });
});
```

`repositoryId.test.ts` 验证路径分隔符和 Windows 大小写规范化不会生成两个 ID。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/unit/parseStatus.test.ts test/unit/repositoryId.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3：实现领域类型、稳定 ID 和状态解析器**

`src/domain/repository.ts` 定义 `RepositoryState`、`BranchState`、`ChangedFile`、`FileChangeKind`、`RepositoryHealth`、`GitCommandResult`。`ChangedFile` 必须同时表达 staged 与 unstaged，因为同一文件可以两者同时存在。

`parseStatus.ts` 导出：

```ts
export interface ParsedStatus {
  branch: {
    oid?: string;
    head?: string;
    upstream?: string;
    ahead: number;
    behind: number;
    detached: boolean;
  };
  files: Array<{
    path: string;
    originalPath?: string;
    indexCode: string;
    worktreeCode: string;
    staged: boolean;
    unstaged: boolean;
    conflicted: boolean;
    untracked: boolean;
  }>;
}

/**
 * 解析机器可读的 porcelain v2 -z 输出。NUL 分隔用于保留空格、中文和换行之外的合法路径字符。
 */
export function parsePorcelainV2(raw: string): ParsedStatus {
  // 按 NUL token 逐项解析 #、1、2、u、?、! 记录；类型 2 的下一个 token 是原路径。
}
```

实现时不得按行解析文件记录；分支 header 虽以 `#` 开头，也从 NUL token 中读取。冲突记录以 `u` 为准，不从普通 XY 状态猜测。

- [ ] **Step 4：运行单元测试和类型检查**

Run: `npm run check && npm test -- --run test/unit/parseStatus.test.ts test/unit/repositoryId.test.ts`

Expected: PASS，并覆盖 rename 的双 token 解析。

- [ ] **Step 5：提交领域模型与解析器**

```bash
git add src/domain src/git/parseStatus.ts test/unit/parseStatus.test.ts test/unit/repositoryId.test.ts
git commit -m "feat: parse multi-repository git status"
```

## Task 3：实现安全的 GitClient 和真实 Git 测试夹具

**Files:**
- Create: `src/git/gitClient.ts`
- Create: `src/infrastructure/configuration.ts`
- Create: `src/infrastructure/output.ts`
- Create: `test/helpers/gitFixture.ts`
- Create: `test/integration/gitClient.test.ts`

- [ ] **Step 1：写 GitClient 失败测试**

测试使用 `test/helpers/gitFixture.ts` 创建临时仓库，禁止 mock Shell：

```ts
it('通过参数数组处理带空格路径并返回结构化结果', async () => {
  const fixture = await createGitFixture('repo with spaces');
  await fixture.write('src/hello world.txt', 'hello');

  const result = await client.run(fixture.root, ['status', '--porcelain=v2', '-z']);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('src/hello world.txt');
  expect(result.timedOut).toBe(false);
});
```

同时测试不存在的 Git 路径、非零退出码、只读命令超时和 stderr 脱敏。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/integration/gitClient.test.ts`

Expected: FAIL，提示 `GitClient` 和 fixture 不存在。

- [ ] **Step 3：实现 GitClient**

`GitClient.run(cwd, args, options)` 使用 `spawn(gitPath, args, { cwd, shell: false, windowsHide: true, env })`。实现以下规则：

- 默认设置 `GIT_TERMINAL_PROMPT=0`，避免扩展宿主被不可见的凭据输入阻塞；
- 只读命令支持 AbortSignal 和超时，超时后先发送终止信号并返回 `timedOut: true`；
- 写命令不使用通用超时强杀，由 OperationController 显示进行中状态；
- 输出限制最大字节数，超过限制返回 `truncated: true`；
- OutputChannel 记录命令名、仓库 ID、耗时和退出码，不记录环境变量、Token 或远端 URL 中的凭据；
- `detectCapabilities()` 返回 Git 版本以及是否支持 `merge-tree --write-tree`。

对凭据认证，首版依赖系统 Credential Manager、SSH agent 或预先配置好的环境；无交互认证失败时给出终端操作指引。

- [ ] **Step 4：运行 GitClient 测试**

Run: `npm run check && npm test -- --run test/integration/gitClient.test.ts`

Expected: PASS；临时仓库测试结束后目录被清理。

- [ ] **Step 5：提交 GitClient**

```bash
git add src/git/gitClient.ts src/infrastructure test/helpers test/integration/gitClient.test.ts
git commit -m "feat: add safe git command runner"
```

## Task 4：递归发现数百个独立仓库并维护索引

**Files:**
- Create: `src/discovery/repositoryScanner.ts`
- Create: `src/discovery/repositoryIndex.ts`
- Create: `src/infrastructure/workspaceCache.ts`
- Create: `test/unit/repositoryScanner.test.ts`
- Create: `test/unit/repositoryIndex.test.ts`

- [ ] **Step 1：写深层和嵌套仓库失败测试**

```ts
it('发现任意深度仓库并继续扫描外层仓库的普通子目录', async () => {
  await createMarker('/workspace/group/a/.git', 'directory');
  await createMarker('/workspace/outer/.git', 'directory');
  await createMarker('/workspace/outer/packages/inner/.git', 'directory');
  await createMarker('/workspace/node_modules/ignored/.git', 'directory');

  const result = await scanner.scan(['/workspace']);

  expect(result.map((item) => item.root)).toEqual([
    '/workspace/group/a',
    '/workspace/outer',
    '/workspace/outer/packages/inner',
  ]);
});
```

补充 `.git` 文件、最大深度、排除规则、符号链接循环、取消扫描、多个工作区重复路径和最长仓库根归属测试。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/unit/repositoryScanner.test.ts test/unit/repositoryIndex.test.ts`

Expected: FAIL，提示 scanner/index 不存在。

- [ ] **Step 3：实现扫描器、索引和缓存**

`WorkspaceRepositoryScanner.scan(roots, options, signal)` 使用 `fs.promises.opendir` 逐目录遍历，避免一次性读取巨型目录。发现 `.git` 后记录父目录，但只跳过 `.git` 本身，继续检查普通子目录；默认排除 `node_modules`、`dist`、`build`、`out`、`coverage`。

`RepositoryIndex` 必须提供：

```ts
upsertRepository(discovered: DiscoveredRepository): RepositoryState;
removeMissing(validRoots: ReadonlySet<string>): string[];
findOwningRepository(fileFsPath: string): RepositoryState | undefined;
updateStatus(repositoryId: string, status: RepositoryStatusSnapshot): void;
getSorted(options: { hideClean: boolean; filter: string }): RepositoryState[];
```

`findOwningRepository` 使用最长规范化根路径匹配，保证嵌套仓库文件归属内层仓库。`WorkspaceCache` 只持久化路径和最近发现时间，激活后必须重新验证。

- [ ] **Step 4：运行扫描与索引测试**

Run: `npm run check && npm test -- --run test/unit/repositoryScanner.test.ts test/unit/repositoryIndex.test.ts`

Expected: PASS；取消测试在 AbortSignal 后停止继续读取目录。

- [ ] **Step 5：提交仓库发现能力**

```bash
git add src/discovery src/infrastructure/workspaceCache.ts test/unit/repositoryScanner.test.ts test/unit/repositoryIndex.test.ts
git commit -m "feat: discover and index nested repositories"
```

## Task 5：实现有限并发状态刷新与文件事件监听

**Files:**
- Create: `src/scheduling/asyncPool.ts`
- Create: `src/scheduling/repositoryTaskScheduler.ts`
- Create: `src/git/gitStatusService.ts`
- Create: `src/watching/workspaceWatcher.ts`
- Create: `test/unit/asyncPool.test.ts`
- Create: `test/unit/repositoryTaskScheduler.test.ts`
- Create: `test/unit/workspaceWatcher.test.ts`
- Create: `test/integration/gitStatusService.test.ts`

- [ ] **Step 1：写并发、串行和去抖失败测试**

```ts
it('只读刷新不超过并发上限，同仓库写操作严格串行', async () => {
  const scheduler = new RepositoryTaskScheduler({ readConcurrency: 3 });
  const tracker = new ConcurrencyTracker();

  await Promise.all(Array.from({ length: 20 }, (_, index) =>
    scheduler.runRead(`repo-${index}`, () => tracker.run()),
  ));

  expect(tracker.maximum).toBe(3);
});
```

Watcher 测试验证同一仓库 300ms 内的多个文件事件只触发一次刷新，嵌套仓库文件只刷新内层仓库，`.git` 标记变化触发增量重扫。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/unit/asyncPool.test.ts test/unit/repositoryTaskScheduler.test.ts test/unit/workspaceWatcher.test.ts test/integration/gitStatusService.test.ts`

Expected: FAIL，提示调度与状态服务不存在。

- [ ] **Step 3：实现调度、状态服务和监听器**

`GitStatusService.refresh(repository)` 执行：

```ts
await git.run(repository.root.fsPath, [
  'status',
  '--porcelain=v2',
  '--branch',
  '-z',
  '--untracked-files=all',
]);
```

解析后原子更新 RepositoryIndex。刷新失败保留上一次成功文件列表，同时将仓库健康状态标为 `error`，避免一次短暂错误让所有改动从界面消失。

Scheduler 合并同仓库重复只读任务；写操作开始后阻止新的同仓库写操作，并在结束时执行一次被延迟的刷新。Watcher 使用 VS Code FileSystemWatcher 和窗口焦点事件，事件回调只入队，不直接运行 Git。

- [ ] **Step 4：运行相关测试**

Run: `npm run check && npm test -- --run test/unit/asyncPool.test.ts test/unit/repositoryTaskScheduler.test.ts test/unit/workspaceWatcher.test.ts test/integration/gitStatusService.test.ts`

Expected: PASS；测试证明 20 个仓库刷新时活跃 Git 状态任务不超过 3。

- [ ] **Step 5：提交刷新流水线**

```bash
git add src/scheduling src/git/gitStatusService.ts src/watching test/unit/asyncPool.test.ts test/unit/repositoryTaskScheduler.test.ts test/unit/workspaceWatcher.test.ts test/integration/gitStatusService.test.ts
git commit -m "feat: schedule repository status refreshes"
```

## Task 6：实现仓库树、详情 Webview 和原生 Diff

**Files:**
- Create: `src/views/repositoryTreeProvider.ts`
- Create: `src/views/repositoryDetailsView.ts`
- Create: `src/views/detailsHtml.ts`
- Create: `src/views/diffContentProvider.ts`
- Create: `src/git/gitDiffService.ts`
- Create: `test/unit/repositoryTreeProvider.test.ts`
- Create: `test/unit/detailsHtml.test.ts`
- Create: `test/integration/gitDiffService.test.ts`

- [ ] **Step 1：写树节点、CSP 和 Diff 失败测试**

树测试验证冲突 > 已修改 > 错误/刷新中 > 干净的排序，以及 staged/conflicted/changes 分组。HTML 测试必须包含 nonce CSP，且不包含远程脚本、`command:` URI、`linear-gradient` 或 `display: inline-flex`。

Diff 集成测试创建同一文件同时 staged 和 unstaged 的状态，并断言：

```ts
expect(await diff.readIndexVersion(repo, 'src/app.ts')).toBe('staged content\n');
expect(await diff.readHeadVersion(repo, 'src/app.ts')).toBe('base content\n');
expect(await fixture.read('src/app.ts')).toBe('worktree content\n');
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/unit/repositoryTreeProvider.test.ts test/unit/detailsHtml.test.ts test/integration/gitDiffService.test.ts`

Expected: FAIL，提示视图和 Diff 服务不存在。

- [ ] **Step 3：实现原生树、受限 Webview 和 Diff Provider**

TreeItem 的 `contextValue` 明确区分 repository、stagedFile、unstagedFile、conflictFile，用于菜单条件；文件命令参数固定为 `{ repositoryId, relativePath, side }`。

Webview 消息只允许：

```ts
type DetailsMessage =
  | { type: 'commit'; repositoryId: string; message: string }
  | { type: 'safePull'; repositoryId: string }
  | { type: 'push'; repositoryId: string }
  | { type: 'refresh'; repositoryId: string };
```

扩展宿主验证消息类型、仓库存在性、当前选中仓库一致性和提交消息长度。HTML 使用 `localResourceRoots: []`、nonce CSP 和 VS Code 主题变量。

Diff provider 注册 `multi-repo-git` scheme，虚拟 URI 查询参数包含 repositoryId、relativePath、source 和 statusVersion。GitDiffService 使用 `git show HEAD:<path>` 与 `git show :<path>` 获取 HEAD/index 内容；未跟踪与删除文件使用空文档；二进制或超限文件返回说明文档。

- [ ] **Step 4：运行视图和 Diff 测试**

Run: `npm run check && npm test -- --run test/unit/repositoryTreeProvider.test.ts test/unit/detailsHtml.test.ts test/integration/gitDiffService.test.ts`

Expected: PASS；同名文件的不同仓库虚拟 URI 不相等。

- [ ] **Step 5：提交核心界面**

```bash
git add src/views src/git/gitDiffService.ts test/unit/repositoryTreeProvider.test.ts test/unit/detailsHtml.test.ts test/integration/gitDiffService.test.ts
git commit -m "feat: add repository views and native diffs"
```

## Task 7：实现按文件暂存、取消暂存和 Commit

**Files:**
- Create: `src/git/gitOperationService.ts`
- Create: `src/operations/operationController.ts`
- Create: `test/integration/stageCommit.test.ts`
- Create: `test/unit/operationController.test.ts`

- [ ] **Step 1：写单仓库写操作失败测试**

```ts
it('commit 只提交暂存区，不隐式提交未暂存文件', async () => {
  await fixture.write('staged.txt', 'next staged\n');
  await fixture.write('unstaged.txt', 'next unstaged\n');
  await operations.stage(repo, 'staged.txt');
  await operations.commit(repo, 'commit staged only');

  expect(await fixture.show('HEAD:staged.txt')).toBe('next staged\n');
  expect(await fixture.show('HEAD:unstaged.txt')).toBe('base unstaged\n');
  expect((await status.refresh(repo)).files.some((file) => file.path === 'unstaged.txt')).toBe(true);
});
```

补充首次提交仓库取消暂存、冲突时拒绝提交、空消息、无暂存文件、hook 拒绝和仓库 ID 被切换的测试。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/integration/stageCommit.test.ts test/unit/operationController.test.ts`

Expected: FAIL，提示操作服务不存在。

- [ ] **Step 3：实现暂存、取消暂存和提交**

GitOperationService 固定使用参数数组：

```ts
stage(root, path)        => git add -- <path>
unstage(root, path)      => git restore --staged -- <path>
commit(root, message)    => git commit -m <message>
```

没有 HEAD 的首次提交仓库中，如果 `restore --staged` 不适用，使用 `git rm --cached -- <path>`，并确认工作区文件仍存在。任何路径先通过 RepositoryIndex 的根路径边界校验；禁止绝对路径和 `..` 逃逸。

OperationController 在任务入队和真正执行前都解析 repositoryId，校验冲突、暂存区和提交消息；成功后刷新目标仓库，失败时保留提交消息并输出脱敏诊断。

- [ ] **Step 4：运行写操作测试**

Run: `npm run check && npm test -- --run test/integration/stageCommit.test.ts test/unit/operationController.test.ts`

Expected: PASS；测试确认未暂存文件没有进入新提交。

- [ ] **Step 5：提交暂存与提交能力**

```bash
git add src/git/gitOperationService.ts src/operations/operationController.ts test/integration/stageCommit.test.ts test/unit/operationController.test.ts
git commit -m "feat: stage files and commit per repository"
```

## Task 8：实现安全 Pull 和 Push

**Files:**
- Modify: `src/git/gitOperationService.ts`
- Modify: `src/operations/operationController.ts`
- Create: `test/integration/safePull.test.ts`
- Create: `test/integration/push.test.ts`
- Create: `test/unit/safePullController.test.ts`

- [ ] **Step 1：写冲突前停止的失败测试**

使用 bare 远端和两个工作副本构造分叉冲突。测试前后记录本地 `HEAD`、`git write-tree` 和工作区文件内容：

```ts
const before = await fixture.snapshotWorkingState();
const result = await operations.safePull(repo);
const after = await fixture.snapshotWorkingState();

expect(result.kind).toBe('conflict-prevented');
expect(after.head).toBe(before.head);
expect(after.indexTree).toBe(before.indexTree);
expect(after.files).toEqual(before.files);
expect(await fixture.revParse('refs/remotes/origin/main')).not.toBe(before.remoteTrackingHead);
```

另写 fast-forward 成功、分叉无冲突 merge 成功、dirty worktree 拒绝、无上游拒绝、Fetch 后外部修改 HEAD 拒绝、Git 不支持 merge-tree 时禁用，以及 push 设置上游确认测试。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- --run test/integration/safePull.test.ts test/integration/push.test.ts test/unit/safePullController.test.ts`

Expected: FAIL，提示 safePull/push 未实现。

- [ ] **Step 3：实现固定提交对象的安全 Pull**

安全拉取必须按以下命令与校验顺序实现：

```text
git status --porcelain=v2 -z --untracked-files=all
git symbolic-ref --quiet --short HEAD
git rev-parse HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{upstream}
git fetch --prune <remote>
git rev-parse HEAD
git rev-parse <upstream>
git merge-base --is-ancestor <localOid> <upstreamOid>
git merge-tree --write-tree <localOid> <upstreamOid>
git rev-parse HEAD
git rev-parse <upstream>
git merge --ff-only <upstreamOid>              # 可 fast-forward
git merge --no-edit <upstreamOid>              # 分叉且预检无冲突
```

实现要点：

- Fetch 前只要 staged、unstaged、untracked、conflicted 任一非空就拒绝；
- Fetch 可以更新远端引用，但不能修改本地 HEAD、索引和工作区；
- merge-tree 非零退出且报告冲突时返回 `conflict-prevented`，不执行 merge/rebase；
- 预检和 merge 之间再次比较 localOid/upstreamOid，任一变化返回 `stale-preflight`；
- 不支持 merge-tree 时返回 `unsupported-git`，不降级普通 pull；
- 首版不执行 rebase；
- 对无关历史、缺失对象、hooks、权限和锁文件失败分别返回明确结果。

- [ ] **Step 4：实现 Push 并运行安全操作测试**

已有 upstream 使用 `git push`；无 upstream 时由 Controller 展示远端和分支，经确认后执行 `git push --set-upstream <remote> <branch>`。不把密码或 Token 放进命令参数。

Run: `npm run check && npm test -- --run test/integration/safePull.test.ts test/integration/push.test.ts test/unit/safePullController.test.ts`

Expected: PASS；冲突用例的 HEAD、index tree 和工作区内容完全不变，只有远端跟踪引用更新。

- [ ] **Step 5：提交安全同步能力**

```bash
git add src/git/gitOperationService.ts src/operations/operationController.ts test/integration/safePull.test.ts test/integration/push.test.ts test/unit/safePullController.test.ts
git commit -m "feat: prevent conflicting pulls before merge"
```

## Task 9：组合扩展、注册命令与配置

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`
- Modify: `src/infrastructure/configuration.ts`
- Create: `test/unit/configuration.test.ts`
- Create: `test/vscode/suite/extension.test.ts`
- Create: `test/vscode/runTest.ts`
- Create: `test/vscode/index.ts`
- Create: `tsconfig.test.json`

- [ ] **Step 1：写扩展激活和配置失败测试**

配置测试验证默认值：扫描深度 12、状态并发 4、事件去抖 300ms、不跟随符号链接、隐藏干净仓库 false、只读超时 15 秒、Diff 上限 2 MiB。

Extension Host 测试验证：

```ts
const extension = vscode.extensions.getExtension('multi-repo-tools.multi-repo-git');
assert.ok(extension);
await extension.activate();
assert.ok(vscode.commands.getCommands(true).then((commands) =>
  commands.includes('multiRepoGit.refreshAll')));
```

`publisher` 在首个任务固定为 `multi-repo-tools`，因此测试使用稳定扩展 ID `multi-repo-tools.multi-repo-git`，不得按环境动态猜测扩展 ID。

- [ ] **Step 2：运行测试确认组合根尚未完成**

Run: `npm test -- --run test/unit/configuration.test.ts`

Expected: FAIL，默认配置未定义。

- [ ] **Step 3：注册完整配置、命令、视图与生命周期**

`package.json` 增加配置和命令：refreshAll、refreshRepository、openDiff、stageFile、unstageFile、commit、safePull、push、showOutput。菜单通过 `viewItem == multiRepoGit.repositories` 和 `contextValue` 控制。

`activate()` 按以下顺序组合：

1. 创建 OutputChannel、Configuration、GitClient 和能力检测；
2. 创建 Scanner、Cache、Index、Scheduler、StatusService；
3. 注册 TreeDataProvider、WebviewViewProvider、TextDocumentContentProvider；
4. 创建 OperationController 并注册命令；
5. 先加载缓存并渲染，再后台扫描和刷新；
6. 启动 WorkspaceWatcher；
7. 将 watcher、providers、命令和 output 全部加入 subscriptions。

配置变化时：展示配置只刷新树；调度配置重建并发池；扫描配置取消旧扫描并提示后重扫；Git 路径变化重新检测能力。

- [ ] **Step 4：运行全部单元、集成和 VS Code 测试**

Run: `npm run check && npm run build && npm run test:unit && npm run test:integration && npm run test:vscode`

Expected: 全部 PASS，Extension Host 可加载两个视图并注册所有命令。

- [ ] **Step 5：提交扩展组合根**

```bash
git add src/extension.ts src/infrastructure/configuration.ts package.json test/unit/configuration.test.ts test/vscode tsconfig.test.json
git commit -m "feat: wire multi-repository extension services"
```

## Task 10：验证数百仓库性能、错误反馈和发布产物

**Files:**
- Create: `test/performance/hundredsOfRepositories.test.ts`
- Create: `test/integration/errorHandling.test.ts`
- Create: `README.md`
- Modify: `package.json`
- Modify: `.vscodeignore`

- [ ] **Step 1：写性能与错误处理失败测试**

性能测试生成 300 个最小 Git 仓库和 3,000 个普通目录，记录扫描、首轮有限并发状态刷新和单仓库增量刷新。测试不使用极端毫秒硬门槛，而验证行为约束：

```ts
expect(result.repositories).toHaveLength(300);
expect(metrics.maximumConcurrentGitProcesses).toBeLessThanOrEqual(4);
expect(metrics.fullTreeRebuildsAfterSingleRepoChange).toBe(0);
expect(metrics.eventRefreshCountForBurst).toBe(1);
```

错误测试覆盖 Git 不存在、仓库删除、锁文件、认证失败、二进制/超限 Diff、命令输出截断和读取状态失败时保留旧快照。

- [ ] **Step 2：运行测试确认缺少性能指标和错误映射**

Run: `npm test -- --run test/performance/hundredsOfRepositories.test.ts test/integration/errorHandling.test.ts`

Expected: FAIL，提示 metrics 或错误映射未实现。

- [ ] **Step 3：补齐可观察指标、错误文案与用户文档**

只在测试或诊断模式暴露扫描目录数、仓库数、活跃 Git 进程数、刷新合并次数和树节点增量更新次数。生产 OutputChannel 使用摘要，不输出文件内容或环境变量。

`README.md` 必须说明：

- 插件用途和独立仓库目录示例；
- 默认扫描排除项和数百仓库性能策略；
- Diff、暂存、提交、安全 Pull 和 Push 使用方法；
- 安全 Pull 会 Fetch，但冲突预检失败时不会修改当前分支、索引和工作区；
- 首版不支持 rebase、批量写操作和按行暂存；
- Git 版本要求、凭据复用方式和诊断步骤；
- 所有配置项及默认值。

- [ ] **Step 4：执行最终验证并检查打包内容**

Run: `npm run check && npm run build && npm run test:unit && npm run test:integration && npm run test:vscode`

Run: `npx @vscode/vsce ls`

Expected: 所有测试 PASS；发布清单包含 `dist/extension.js`、`package.json`、`README.md`、`resources/multi-repo.svg`，不包含源码测试、`.superpowers/`、临时仓库或凭据文件。

- [ ] **Step 5：提交最终验证与文档**

```bash
git add test/performance test/integration/errorHandling.test.ts README.md package.json .vscodeignore
git commit -m "test: verify multi-repository scale and failures"
```

## Task 11：人工验收

**Files:**
- Modify: `README.md`（仅在实际验收发现说明缺失时）

- [ ] **Step 1：在 macOS 创建含外层和内层仓库的真实工作区**

打开包含至少 20 个仓库、一个嵌套仓库、一个中文路径仓库和一个带空格路径仓库的目录，确认活动栏逐步出现仓库且 VS Code 可正常编辑文件。

- [ ] **Step 2：验证改动、Diff、暂存与提交**

在两个仓库制造 staged、unstaged、untracked、rename 和 delete，确认排序、分组、原生 Diff、单文件暂存和“只提交暂存区”符合规格。

- [ ] **Step 3：验证安全 Pull**

分别构造 fast-forward、分叉无冲突和分叉有冲突。冲突用例执行前后运行：

```bash
git rev-parse HEAD
git write-tree
git status --porcelain=v2 -z
```

Expected: 冲突预检后 HEAD、index tree 和工作区状态不变，远端跟踪引用已更新，界面列出冲突预检结果。

- [ ] **Step 4：在 Windows 和 Linux 执行跨平台冒烟测试**

确认 Git 路径检测、带空格路径、中文路径、Diff、暂存、提交和 fast-forward 安全拉取可用；命令不依赖 zsh、bash 或 PowerShell 拼接。

- [ ] **Step 5：记录验收结果并提交**

如果无需修改代码，在提交信息中只包含 README 的实际验收说明；不要创建空提交。

```bash
git add README.md
git diff --cached --quiet || git commit -m "docs: record cross-platform acceptance results"
```

## 完成条件

实施完成前必须同时满足：

- `npm run check`、build、unit、integration、VS Code 测试全部通过；
- 300 仓库性能测试证明并发受控、事件合并、树增量刷新；
- 冲突 Pull 测试证明 HEAD、索引和工作区不变；
- 所有 Git 写命令均携带明确 repositoryId 并按仓库串行；
- Webview 使用严格 CSP，扩展宿主重新校验所有消息；
- 不保存或输出 Git 凭据；
- `.scss`/`.css` 中不存在未隔离的 RN 不兼容样式，本项目实际样式不使用 `linear-gradient` 或 `display: inline-flex`；
- README、配置和发布清单与实现一致。
