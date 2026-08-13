#!/usr/bin/env node
/**
 * npm run harness:doctor
 *
 * 自检 .harness/ 体系的健康度，仅查事实、不修复：
 *   - 必需文件是否存在
 *   - SKILL.md frontmatter 是否合法
 *   - changes/ 下每个目录是否有 summary.md 且不停留在 TODO 太久
 *   - docs/ 是否已收录扩展点（见 wiki/architecture.md）
 *
 * 退出码 0 = 无致命问题（warning 不算致命）。
 * 本检查只做「文件与状态」事实校验；依赖方向/编码门禁由
 * dev-workflow 各阶段的 typecheck 与 unit test 承担。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const H = join(root, '.harness');

let errors = 0;
let warnings = 0;

function err(msg) {
  console.error(`✗ ${msg}`);
  errors++;
}
function warn(msg) {
  console.warn(`! ${msg}`);
  warnings++;
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

const required = [
  'agents/frontend-owner.md',
  'rules/project-structure.md',
  'rules/coding-standard.md',
  'rules/dev-workflow.md',
  'wiki/architecture.md',
  'wiki/domain-model.md',
  'mcp/servers.json',
  'templates/change-template/summary.md',
];
for (const rel of required) {
  if (existsSync(join(H, rel))) ok(`required: ${rel}`);
  else err(`missing required file: .harness/${rel}`);
}

// SKILL.md frontmatter
const skillsDir = join(H, 'skills');
const skillEntries = await readdir(skillsDir, { withFileTypes: true });
const skillNames = skillEntries.filter((e) => e.isDirectory()).map((e) => e.name);
for (const name of skillNames) {
  const skillFile = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(skillFile)) {
    err(`skill missing SKILL.md: ${name}`);
    continue;
  }
  const text = await readFile(skillFile, 'utf-8');
  const m = text.match(/^---\n([\s\S]+?)\n---/);
  if (!m) {
    err(`skill ${name}: SKILL.md missing YAML frontmatter`);
    continue;
  }
  const front = m[1];
  if (!/name:\s*\S+/.test(front)) err(`skill ${name}: missing "name" in frontmatter`);
  if (!/description:\s*\S+/.test(front)) err(`skill ${name}: missing "description"`);
  if (front.length > 800) warn(`skill ${name}: description very long; consider trimming`);
  ok(`skill: ${name}`);
}

// changes
const changesDir = join(H, 'changes');
if (existsSync(changesDir)) {
  const entries = await readdir(changesDir, { withFileTypes: true });
  const items = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const c of items) {
    const sumPath = join(changesDir, c, 'summary.md');
    if (!existsSync(sumPath)) {
      err(`change ${c}: missing summary.md`);
      continue;
    }
    const text = await readFile(sumPath, 'utf-8');
    const todoCount = (text.match(/TODO/g) ?? []).length;
    const stats = await stat(sumPath);
    const ageDays = (Date.now() - stats.mtimeMs) / 86400000;
    if (todoCount > 0 && ageDays > 7) {
      warn(`change ${c}: has ${todoCount} TODO and inactive for ${ageDays.toFixed(0)}d`);
    }
    ok(`change: ${c} (${todoCount} TODO)`);
  }
}

// docs 收录扩展点（extension.ts 注册的视图/命令，事实对账）
const extPath = join(root, 'src', 'extension.ts');
if (existsSync(extPath)) {
  const text = await readFile(extPath, 'utf-8');
  const wiki = join(H, 'wiki', 'architecture.md');
  if (existsSync(wiki)) {
    const wikiText = await readFile(wiki, 'utf-8');
    const cmdMatch = [...text.matchAll(/registerCommand\((['"])([^'"]+)\1/g)].map((m) => m[2]);
    for (const c of cmdMatch) {
      if (wikiText.includes(c)) ok(`command documented: ${c}`);
      else err(`command "${c}" not documented in wiki/architecture.md (docs drift)`);
    }
    if (cmdMatch.length === 0) warn('no registerCommand found in src/extension.ts');
  }
} else {
  warn('src/extension.ts not found; skipping docs-drift check');
}

console.log('');
if (errors > 0) {
  console.error(`harness-doctor: ${errors} errors, ${warnings} warnings`);
  process.exit(1);
}
console.log(`harness-doctor: 0 errors, ${warnings} warnings`);
