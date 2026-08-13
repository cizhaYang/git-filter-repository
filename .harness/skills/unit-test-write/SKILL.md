---
name: unit-test-write
description: 步骤 4 — 单元测试编写。触发场景:"写单测"、"补测试"、"unit test"、"node --test"。基于改动驱动测试原则，针对被改动的纯逻辑模块生成 node:test 单测，mock 走依赖注入。
---

# Skill: unit-test-write

## 核心原则
**改动驱动测试（Change-driven Testing）**：改了哪个文件就测哪个文件。**不要**借机做"补全式覆盖"。

## 输入
- 步骤 2 产出的 `coding_report_v{n}.md` 中"改动文件列表"
- 现有单测参考：`test/unit/*.test.cjs`（相对 dist 编译产物运行）

## 测试环境（栈事实）
- 单测用 `node --test` 跑，文件命名 `*.test.cjs`，位于 `test/unit/`，对应 `src/*` 的编译产物 `dist/*.js`。
- 纯逻辑模块（`domain/*`、`git/*` 解析器、`views/*` 的纯状态类）才可单测；依赖 `vscode` API 的模块通过**依赖注入**替换后再测。
- 断言用 `node:assert` / `node:test` 标准 API。

## 步骤
1. 读 coding_report，列出本次需要新增/修改测试的文件。
2. 对每个目标文件，列出 3 类用例：
   - **happy path**（正常流程）
   - **edge case**（空数据、错误输入、边界值）
   - **regression**（如果是 bug 修复，写一条专门复现该 bug 的用例）
3. 测试文件放 `test/unit/*.test.cjs`，与被测编译产物同名映射。
4. 把依赖（`vscode`、`child_process`、Git 结果）通过构造函数/工厂**注入**为可控假实现，**禁止**真实执行 Git 或启动 Extension Host。
5. 断言行为输出（解析结果、状态机输入输出），**禁止**断言不被当前单测处理的 UI 线程细节。

## 模板

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseGitStatus } = require('../../dist/git/gitStatusParser.js');

test('gitStatusParser: happy path parses modified file', () => {
  const input = ' M src/views/changedFilesProvider.ts';
  const result = parseGitStatus(input);
  assert.equal(result.status, 'M');
  assert.equal(result.path, 'src/views/changedFilesProvider.ts');
});

test('gitStatusParser: edge case tolerates rename marker', () => {
  const input = 'R  old.txt -> new.txt';
  assert.ok(parseGitStatus(input).isRename);
});
```

## 输出
- 测试文件
- `unit_test/test_plan.md`：列出新增/修改的测试用例及对应改动文件

## Checklist
- [ ] 改动文件 vs 测试文件**一一对应**
- [ ] 每个测试文件至少 1 条 happy + 1 条 edge
- [ ] 无真实 Git / vscode 依赖泄漏；mock 全走注入
- [ ] `npm test` 退出码 0 且 `pass > 0`
