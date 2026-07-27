import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

function collectTsEntries(dir) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...collectTsEntries(fullPath));
      continue;
    }
    if (item.isFile() && item.name.endsWith('.ts')) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const config = {
  entryPoints: collectTsEntries('src'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outdir: 'dist',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('watching...');
} else {
  await esbuild.build(config);
}
