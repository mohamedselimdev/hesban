import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFuses, findFuseViolations } from './fuses.mjs';

const problems = [];
const root = process.cwd();

const html = join(root, 'out/renderer/index.html');
const preload = join(root, 'out/preload/index.cjs');
const main = join(root, 'out/main/index.js');

for (const file of [html, preload, main]) {
  if (!existsSync(file)) problems.push(`missing build output: ${file}`);
}

if (existsSync(html)) {
  const text = readFileSync(html, 'utf8');
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(text);
  if (!meta) {
    problems.push('production CSP meta tag missing');
  } else {
    const csp = meta[1];
    if (/unsafe-inline|unsafe-eval/.test(csp)) problems.push('CSP contains unsafe directives');
    if (!/default-src 'none'/.test(csp)) problems.push("CSP default-src is not 'none'");
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(text)) problems.push('inline script found in index.html');
  if (/https?:\/\//.test(text.replace(/<meta[^>]*>/g, ''))) {
    problems.push('external URL referenced from index.html');
  }
}

if (existsSync(preload)) {
  const text = readFileSync(preload, 'utf8');
  if (/exposeInMainWorld\(\s*['"]ipcRenderer/.test(text))
    problems.push('preload exposes ipcRenderer');
}

if (process.argv.includes('--fuses')) {
  const electronExe = (await import('electron')).default;
  const dir = mkdtempSync(join(tmpdir(), 'hesban-fuses-'));
  const copy = join(dir, 'electron.exe');
  try {
    copyFileSync(electronExe, copy);
    const before = await findFuseViolations(copy);
    await applyFuses(copy);
    const after = await findFuseViolations(copy);
    console.log(`fuse violations before apply: ${before.length}, after apply: ${after.length}`);
    for (const v of after) problems.push(`fuse: ${v}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (problems.length > 0) {
  console.error('verify-build FAILED');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}
console.log('verify-build OK');
