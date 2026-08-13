# Rule: 项目编码规范（Coding Standard）

> 每条规则背后都对应一个真实踩过的坑。觉得"啰嗦"时请先问"这能不能被机器校验"——能就写到 `npm run check` 或 linter 里。

## 1. TypeScript

- 项目运行在 **strict 模式**。禁止关闭 `strict` / `noUncheckedIndexedAccess`（见 `tsconfig.json`）。
- **禁止 `any`**。无法描述时用 `unknown` / `Partial` 然后窄化。
- 函数参数与返回值**必须**显式类型。
- `import type { ... }` 优先（type-only 导入在 bundler 阶段被擦除）。
- 不写 `enum`（用 union 字面量），避免运行时摩擦；与 VS Code API 的字符串枚举常量（如 `TextDocument `）交互时除外。

## 2. 类型真源

- `domain/` 模型类型是该实体的**唯一真源**；其他模块只 `import type`，不重复定义内联接口（见 `wiki/domain-model.md`）。

## 3. 数据与时间约束

- 仓库路径 / 文件名等一律 `string`，**禁止**把文件大小、行数、分支计数算作安全整数之外的 number（大文件用 `number` 时注意精度，必要时 `bigint`）。
- 时间戳统一 ISO-8601 字符串传递，UI 渲染（`description` / `tooltip`）时再格式化。
- 解析 Git 输出不可信的字段（状态码、diff stat）前：先校验格式，失败抛显式错误，**禁止** `as X` 强转。

## 4. Git 层边界（本项目最重要的约束）

- 所有 Git 命令集中在 `src/git/`：`gitCli.ts` 负责 spawn，`gitStatusParser.ts` 负责 output 解析。
- view / domain **禁止**自行拼 shell 字符串。
- 命令注入防护：user/path 类参数必须作为 `subprocess` args 传入（数组形式），**禁止**拼进 `-c "..."` shell 字符串。
- 解析逻辑保持**纯函数**（输入 string 输出结构），便于 `*.test.cjs` 单测。

## 5. 视图与状态

- TreeDataProvider 只做「状态缓存 → TreeItem」的映射；**禁止**在 `getChildren` 里直接跑 Git 命令。
- 状态缓存对账：文件事件 → 更新缓存 → 按仓库 `fireTreeDataChanged`。
- 会话级选择状态收敛到 `views/` 的 `repositorySelectionState.ts`（单一真源）。

## 6. 并发与长任务

- 任何可能超过数十毫秒的 Git 操作必须后台化：用 `withProgress` / 事件驱动 / 并发上限（如手动刷新 ≤ 4 并发）。
- 禁止在 UI 线程同步等待 Git 输出；视图初始化采用"先显示缓存 → 后台增量刷新"。
- 定时器（如每秒对账）记得销毁，避免扩展卸载后泄漏。

## 7. 错误处理

- Git 失败、解析失败**禁止**静默吞掉：`catch (e) {}` 必须 `console.error('[ctx]', e)` 并走降级路径或显式 UI 反馈（`setMessage` / welcome view）。
- `domain` 层抛业务错误（仓库损坏、状态不一致）；`views` 层捕获并转为用户可见信息，**不**把 stack 抛给用户。

## 8. 日志与控制台

- **禁止** `console.log`。使用 `console.warn` / `console.error`，且带语义前缀：`console.error('[changedFiles]', err)`。

## 9. 提交与变更

- Commit message 遵循 Conventional Commits：`fix(scan): 刷新慢的仓库改为增量对账`。
- 每个 commit 关联一个 `.harness/changes/` 变更目录（footer 标注 `Change: fix-refresh-slow-YYYYMMDD`）。
- 跨层重构必须独立成 commit，不与 feat 混合。

## 10. 测试

- 单测以**行为视角**断言，不在测试里重建 UI 线程/真实 Git 环境（导入 `vscode` 的模块不可单测，依赖通过注入替换）。
- 单测文件：`test/unit/*.test.cjs`（相对 dist 编译产物），对应源文件一一映射。
- 改动某个纯逻辑（parser / domain / 缓存）必须有对应单测；`node --test test/unit` 退出码 0 且 `pass > 0`。
