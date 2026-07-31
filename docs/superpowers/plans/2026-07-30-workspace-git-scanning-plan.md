# 工作区 Git 仓库自主扫描实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除插件对 VS Code 内置 Git `repositories` 列表的依赖，改为扫描当前工作区并通过 Git CLI 管理仓库状态和操作。

**Architecture:** `workspaceRepositoryScanner` 只负责发现工作区内的 `.git` 目录或文件；`gitCli` 负责执行命令和解析 `git status --porcelain=v1 -z`；`ChangedRepositoriesProvider` 持有本地仓库模型，负责扫描、状态刷新、文件监听和 Tree View 数据。现有 Tree Item、选择状态和操作 UI 继续复用本地仓库模型。

**Tech Stack:** TypeScript、VS Code Extension API、Node.js `fs`/`child_process`、Git CLI、Node test runner。

---

### Task 1: 定义本地仓库模型和工作区扫描器

**Files:**
- Create: `src/git/localGitRepository.ts`
- Create: `src/git/workspaceRepositoryScanner.ts`
- Create: `test/unit/workspaceRepositoryScanner.test.cjs`
- Modify: imports in `src/domain/repositoryActions.ts`, `src/domain/repositoryChangeFiles.ts`, `src/views/*.ts`, `src/extension.ts`

- [ ] **Step 1: Write the failing scanner tests**

测试扫描器应覆盖：普通 `.git` 目录、`.git` 文件、最大深度、排除目录和重复工作区根目录。测试通过注入目录读取器或使用临时目录，不能依赖当前项目的真实目录结构。

```js
test('scanner finds git directories and git files below workspace roots', async () => {
  const scanner = new WorkspaceRepositoryScanner({
    fileSystem: {
      readDirectory: async (directory) => fixture[directory] ?? [],
      getPathType: async (target) => gitMarkers[target] ?? 'missing',
    },
  });

  const repositories = await scanner.scan(['/workspace']);

  assert.deepEqual(repositories, ['/workspace/app', '/workspace/tools']);
});

test('scanner skips excluded directories and stops at max depth', async () => {
  const repositories = await scanner.scan(['/workspace'], { maxDepth: 2 });

  assert.deepEqual(repositories, ['/workspace/visible']);
});
```

- [ ] **Step 2: Run the scanner test and verify it fails for the missing module**

Run: `npm run build && node --test test/unit/workspaceRepositoryScanner.test.cjs`

Expected: FAIL because `src/git/workspaceRepositoryScanner.ts` and its compiled module do not exist yet.

- [ ] **Step 3: Implement the scanner and stable local repository interface**

实现 `WorkspaceRepositoryScanner`，固定默认排除 `.git`、`node_modules`、`dist`、`out`、`.vscode`，按规范化绝对路径去重；识别 `.git` 目录或 `.git` 文件后记录当前仓库，但继续向下遍历以发现父仓库中的嵌套仓库。扫描错误记录到可选 logger，但不让单个目录错误中断全局扫描。

```ts
export interface WorkspaceRepositoryScannerOptions {
  maxDepth?: number;
  excludedDirectoryNames?: readonly string[];
}

export interface WorkspaceRepositoryScannerFileSystem {
  readDirectory(directory: string): Promise<readonly { name: string; isDirectory: boolean }[]>;
  getPathType(target: string): Promise<'directory' | 'file' | 'missing'>;
}

export class WorkspaceRepositoryScanner {
  constructor(options?: {
    fileSystem?: WorkspaceRepositoryScannerFileSystem;
    logger?: Pick<vscode.OutputChannel, 'appendLine'>;
  }) {}

  scan(workspaceRoots: readonly string[], options?: WorkspaceRepositoryScannerOptions): Promise<string[]>;
}
```

`localGitRepository.ts` 定义 `LocalGitRepository`、`LocalGitState` 和 `LocalGitChange`，保留现有 `indexChanges`、`workingTreeChanges`、`mergeChanges`、`untrackedChanges` 字段，使现有 Tree View 和选择逻辑可以逐步迁移。

- [ ] **Step 4: Run the scanner tests and the existing pure-domain tests**

Run: `npm run build && node --test test/unit/workspaceRepositoryScanner.test.cjs test/unit/repositoryState.test.cjs test/unit/repositorySelectionState.test.cjs`

Expected: 新增扫描器测试和现有领域测试全部 PASS。

---

### Task 2: 实现 Git status 的 NUL 解析

**Files:**
- Create: `src/git/gitStatusParser.ts`
- Create: `test/unit/gitStatusParser.test.cjs`
- Modify: `src/git/localGitRepository.ts`

- [ ] **Step 1: Write failing parser tests**

使用固定的 `porcelain=v1 -z` 字符串测试普通修改、已暂存、未跟踪、冲突、重命名以及包含空格和换行的路径。断言输出只包含标准化路径和状态码，不依赖 VS Code API。

```js
test('parser separates index, working tree, merge, and untracked changes', () => {
  const result = parseGitStatus('M  staged.ts\\0 M working.ts\\0?? new.ts\\0UU conflict.ts\\0');

  assert.deepEqual(result.indexChanges.map((change) => change.path), ['staged.ts']);
  assert.deepEqual(result.workingTreeChanges.map((change) => change.path), ['working.ts']);
  assert.deepEqual(result.untrackedChanges.map((change) => change.path), ['new.ts']);
  assert.deepEqual(result.mergeChanges.map((change) => change.path), ['conflict.ts']);
});

test('parser preserves rename source and destination paths', () => {
  const result = parseGitStatus('R  renamed.ts\\0old.ts\\0');

  assert.equal(result.indexChanges[0].path, 'renamed.ts');
  assert.equal(result.indexChanges[0].originalPath, 'old.ts');
});
```

- [ ] **Step 2: Run the parser tests and verify the expected failure**

Run: `npm run build && node --test test/unit/gitStatusParser.test.cjs`

Expected: FAIL because the parser module or exported function is missing.

- [ ] **Step 3: Implement the parser**

按 NUL 拆分记录，读取每条记录前两个状态字符；对重命名和复制记录读取第二个路径；将冲突状态归入 `mergeChanges`，将 `??` 归入 `untrackedChanges`。路径始终保持 Git 返回的相对路径，由仓库模型转换成 `vscode.Uri.file(path.join(root, relativePath))`。

状态码映射必须保留原始 XY 字符串，同时提供现有 `changeOpenPlan` 可识别的数值或明确字符串状态，避免 staged diff 和 working tree diff 的分支失效。新增注释说明 Git porcelain 状态第一列代表 index、第二列代表 working tree。

- [ ] **Step 4: Run parser and existing change-file tests**

Run: `npm run build && node --test test/unit/gitStatusParser.test.cjs test/unit/repositoryChangeFiles.test.cjs test/unit/changeOpenPlan.test.cjs`

Expected: 新增状态解析测试和现有文件列表、diff 计划测试全部 PASS。

---

### Task 3: 实现可注入的 Git CLI 适配器

**Files:**
- Create: `src/git/gitCli.ts`
- Create: `test/unit/gitCli.test.cjs`
- Modify: `src/domain/repositoryActions.ts`

- [ ] **Step 1: Write failing Git CLI adapter tests**

通过注入 `execFile` 替身断言命令参数使用数组、工作目录正确、status 结果被转换为本地状态，以及 stderr/非零退出码被传播。

```js
test('git cli runs status in the repository root and converts the output', async () => {
  const calls = [];
  const cli = new GitCli({
    execFile: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: ' M src/index.ts\\0', stderr: '' };
    },
  });

  const state = await cli.readStatus('/workspace/repo');

  assert.equal(calls[0].file, 'git');
  assert.deepEqual(calls[0].args, ['-C', '/workspace/repo', 'status', '--porcelain=v1', '-z', '--untracked-files=all']);
  assert.equal(state.workingTreeChanges[0].path, 'src/index.ts');
});

test('git cli preserves command errors', async () => {
  const cli = new GitCli({ execFile: async () => { throw new Error('git unavailable'); } });

  await assert.rejects(() => cli.readStatus('/workspace/repo'), /git unavailable/);
});
```

- [ ] **Step 2: Run the adapter tests and verify they fail**

Run: `npm run build && node --test test/unit/gitCli.test.cjs`

Expected: FAIL because `GitCli` is not implemented.

- [ ] **Step 3: Implement Git CLI commands and local repository facade**

`GitCli` 使用 `node:child_process.execFile`，默认传递 `cwd`、UTF-8 编码和足够的 `maxBuffer`；禁止拼接 shell 字符串。公开方法包括：

```ts
readStatus(rootPath: string): Promise<ParsedGitStatus>;
add(rootPath: string, paths: readonly string[]): Promise<void>;
unstage(rootPath: string, paths: readonly string[]): Promise<void>;
discard(rootPath: string, paths: readonly string[], untracked: boolean): Promise<void>;
commit(rootPath: string, message: string): Promise<void>;
pull(rootPath: string): Promise<void>;
push(rootPath: string): Promise<void>;
readBlob(rootPath: string, ref: string, relativePath: string): Promise<string>;
```

`LocalGitRepository` 将这些方法绑定到仓库根路径，并在 `status()` 后用解析结果替换 state。`add`、`revert`、`clean` 方法保持现有 `repositoryActions` 的调用形状；`commit` 不传 `--all`，保证未暂存修改不会进入提交。

- [ ] **Step 4: Run CLI, repository action, and file action tests**

Run: `npm run build && node --test test/unit/gitCli.test.cjs test/unit/repositoryActions.test.cjs test/unit/repositoryFileActions.test.cjs`

Expected: 所有操作参数和既有提交边界测试 PASS。

---

### Task 4: 将 Changed Repositories Provider 改为工作区仓库源

**Files:**
- Modify: `src/views/changedRepositoriesProvider.ts`
- Modify: `src/views/repositorySelectionState.ts`
- Modify: `src/views/repositoryTreeItem.ts`
- Modify: `src/views/fileChangeTreeItem.ts`
- Modify: `src/views/changeGroupTreeItem.ts`
- Modify: `src/views/commitTreeItem.ts`
- Modify: `src/views/pushTreeItem.ts`
- Modify: `src/domain/repositoryChangeFiles.ts`
- Create: `test/unit/changedRepositoriesWorkspaceProvider.test.cjs`

- [ ] **Step 1: Write failing provider tests**

测试 provider 在初始化时调用扫描器、为发现的仓库执行 status、只返回 dirty 仓库，并在扫描结果增删后创建或释放文件监听。测试使用可注入 scanner、CLI 和 watcher 工厂，避免真实工作区和 Git 命令。

```js
test('provider displays dirty repositories discovered outside native Source Control', async () => {
  const provider = new ChangedRepositoriesProvider({
    workspaceRoots: ['/workspace'],
    scanner: { scan: async () => ['/workspace/repo-a', '/workspace/repo-b'] },
    repositoryFactory: (root) => fixtures[root],
  });

  await provider.initialize();

  assert.deepEqual(provider.getChildren().map((item) => item.repository.rootUri.fsPath), ['/workspace/repo-a']);
});
```

- [ ] **Step 2: Run the provider test and verify the missing workspace source failure**

Run: `npm run build && node --test test/unit/changedRepositoriesWorkspaceProvider.test.cjs`

Expected: FAIL because provider still requires `GitApiLike` and does not accept a workspace scanner.

- [ ] **Step 3: Implement the workspace-backed provider**

移除 `gitApi.repositories`、`onDidOpenRepository`、`onDidCloseRepository` 和 `repository.state.onDidChange` 监听。Provider 自己维护 `Map<rootPath, LocalGitRepository>`，初始化和刷新流程为：扫描路径、同步仓库对象、监听新增仓库、释放消失仓库、并发刷新 status、更新选择状态和 Tree View。

保留现有 150ms 合并刷新和最多 4 个 status 并发限制。工作区文件事件触发重新扫描；仓库文件事件只触发对应仓库 status。`.git` 元数据变化不能造成 status 递归刷新。

为扫描失败、Git 未安装、单仓库 status 失败写入输出通道；失败仓库不阻塞其他仓库。新增方法和嵌套仓库路径选择逻辑补充注释，说明为什么使用最深层仓库。

- [ ] **Step 4: Run provider, selection, and scheduler tests**

Run: `npm run build && node --test test/unit/changedRepositoriesWorkspaceProvider.test.cjs test/unit/changedRepositoriesRefreshScheduler.test.cjs test/unit/repositorySelectionState.test.cjs`

Expected: 新 provider 测试及现有刷新、选择测试 PASS。

---

### Task 5: 替换扩展装配和文件 diff 打开逻辑

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/domain/changeOpenPlan.ts`
- Create or modify: `test/unit/changeOpenPlan.test.cjs`

- [ ] **Step 1: Write failing integration assertions**

增加 manifest/装配测试，断言 `package.json` 不再声明 `vscode.git` 扩展依赖；增加 diff 打开测试，断言 CLI 仓库能够读取 `HEAD` 或 index 内容并构造两个可打开的文档。

```js
test('manifest does not require the built-in Git extension', () => {
  const manifest = require('../../package.json');

  assert.equal(manifest.extensionDependencies?.includes('vscode.git') ?? false, false);
});
```

- [ ] **Step 2: Run the new assertions and verify they fail**

Run: `node --test test/unit/extensionManifest.test.cjs test/unit/changeOpenPlan.test.cjs`

Expected: manifest assertion fails while `vscode.git` remains declared; diff integration assertion fails while `openChange` still constructs a `git:` URI.

- [ ] **Step 3: Wire the workspace provider and replace Git-extension activation**

`activate` 使用 `vscode.workspace.workspaceFolders` 创建 workspace-backed provider，并等待 `initialize()` 完成；没有工作区时创建空 provider，不扫描整个磁盘。删除 `getGitApi()`、`GitApiLike`、`onDidOpenRepository`/`onDidCloseRepository` 和 `git.autoRepositoryDetection` 相关逻辑。

将 `gitExtension.ts` 删除或改为仅导出本地仓库类型，所有 Git 操作由 `GitCli` 提供。更新所有 Tree Item 和 domain imports，确保命令 target 仍能解析到仓库对象。

文件 diff 不再依赖 `git:` URI：

- staged 文件左侧通过 `readBlob(root, 'HEAD', path)` 获取，右侧通过 `readBlob(root, ':', path)` 获取。
- working tree 文件左侧根据现有 diff plan 读取 `HEAD` 或 index，右侧读取真实工作区文件。
- 未跟踪文件直接打开真实文件。
- 使用 `vscode.workspace.openTextDocument({ content, language })` 创建只读临时文档，再调用 `vscode.diff`；临时文档的内容来源和 ref 在注释中说明，避免未暂存内容混入 staged diff。

- [ ] **Step 4: Run manifest, diff, and full type checks**

Run: `npm run check`

Expected: TypeScript 编译通过，且没有对 `vscode.git` 的生产代码引用。

---

### Task 6: 更新扩展清单、消息和文档

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `src/domain/repositoryViewState.ts`
- Modify: `test/unit/repositoryViewState.test.cjs`
- Modify: `test/unit/extensionManifest.test.cjs`

- [ ] **Step 1: Write failing message tests**

增加没有工作区和 Git CLI 不可用的消息断言，并更新原先“启用内置 Git 扩展”的测试期望。

```js
test('repository view explains when no workspace is open', () => {
  assert.equal(getChangedRepositoriesMessage({ workspaceAvailable: false, gitAvailable: true, changedCount: 0 }), 'Open a workspace to scan Git repositories.');
});
```

- [ ] **Step 2: Run message tests and verify old behavior fails**

Run: `npm run build && node --test test/unit/repositoryViewState.test.cjs`

Expected: 新消息签名测试失败，旧的内置 Git 扩展提示仍存在。

- [ ] **Step 3: Update messages and README**

删除 `extensionDependencies.vscode.git`，更新 welcome message 和 README 的“仓库检测范围”“Git CLI 要求”“扫描排除规则”“Git 错误处理”说明。README 必须明确：插件不读取原生 `Repositories` 列表，但仍需要本机可执行 `git` 命令。

- [ ] **Step 4: Run all unit tests**

Run: `npm run build && npm test`

Expected: 全部 Node tests PASS，无 `vscode.git` 依赖相关测试失败。

---

### Task 7: 完整验证并检查变更边界

**Files:**
- Verify: all modified files from Tasks 1-6

- [ ] **Step 1: Run the complete verification commands**

Run: `npm run check`

Expected: exit code 0。

Run: `npm run build`

Expected: exit code 0，并生成 `dist` 编译产物。

Run: `npm test`

Expected: 所有测试通过，失败数为 0。

- [ ] **Step 2: Check the final diff and dependency boundary**

Run: `git diff --check`

Expected: 无空白错误。

Run: `rg -n "vscode\.git|getGitApi|GitApiLike|gitApi\.repositories" src package.json README.md`

Expected: 生产代码和清单不再依赖这些内置 Git API 标识；历史设计文档可以保留旧方案背景，但 README 必须描述新行为。

- [ ] **Step 3: Manually verify the requested scenario**

在 VS Code 中打开包含两个嵌套 Git 仓库的工作区，确保其中一个仓库没有出现在原生 Source Control `Repositories` 列表时，插件仍能扫描并显示该仓库的未提交修改；随后验证暂存、提交、拉取、推送和文件 diff 使用 CLI 逻辑正常工作。
