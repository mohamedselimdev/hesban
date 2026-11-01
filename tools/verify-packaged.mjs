import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFuseViolations } from './fuses.mjs';

const problems = [];
const dir = join(process.cwd(), 'release/win-unpacked');
const exe = join(dir, 'HESBAN.exe');
const asarPath = join(dir, 'resources/app.asar');

if (!existsSync(exe)) problems.push(`packaged executable missing: ${exe}`);
if (!existsSync(asarPath)) problems.push('app.asar missing');

if (existsSync(exe)) {
  for (const v of await findFuseViolations(exe)) problems.push(`fuse: ${v}`);
}

/** Minimal asar header reader: 16 bytes of pickle framing, then the JSON file index. */
function asarPaths(file) {
  const buf = readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const header = JSON.parse(buf.subarray(16, 16 + jsonLength).toString('utf8'));
  const out = [];
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = `${prefix}/${name}`;
      if (child.files) walk(child, path);
      else out.push(path);
    }
  };
  walk(header, '');
  return out;
}

if (existsSync(asarPath)) {
  const paths = asarPaths(asarPath);
  const forbidden = [
    /^\/(src|tests|docs|tools|\.github|\.git)\//,
    /\/out-(ui|probe)\//,
    /\.env/,
    /\.(db|key|pem|pfx|hbk)$/,
    /selftest|uicheck/i,
  ];
  for (const pattern of forbidden) {
    const hit = paths.find((p) => pattern.test(p));
    if (hit) problems.push(`unexpected file inside app.asar: ${hit}`);
  }
  for (const required of [
    '/out/main/index.js',
    '/out/preload/index.cjs',
    '/out/renderer/index.html',
  ]) {
    if (!paths.includes(required)) problems.push(`${required} missing from app.asar`);
  }
  console.log(`app.asar entries: ${paths.length}`);
}

const unpackedNodes = [];
const walkDisk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const full = join(d, e.name);
    if (e.isDirectory()) walkDisk(full);
    else if (e.name.endsWith('.node')) unpackedNodes.push(full);
  }
};
const unpackedDir = join(dir, 'resources/app.asar.unpacked');
if (existsSync(unpackedDir)) walkDisk(unpackedDir);
if (!unpackedNodes.some((p) => p.endsWith('win32-x64.node'))) {
  problems.push('SQLite native binary (win32-x64.node) is not unpacked next to app.asar');
}

if (problems.length > 0) {
  console.error('verify-packaged FAILED');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}
console.log('verify-packaged OK');
