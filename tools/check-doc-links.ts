import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export interface BrokenLink {
  readonly file: string;
  readonly line: number;
  readonly target: string;
}

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** Finds relative links (to files or folders) in Markdown that do not exist on disk. */
export function findBrokenLinks(roots: readonly string[]): BrokenLink[] {
  const broken: BrokenLink[] = [];
  const files = roots.flatMap((r) => (statSync(r).isDirectory() ? markdownFiles(r) : [r]));
  for (const file of files) {
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((text, index) => {
        for (const match of text.matchAll(LINK)) {
          const raw = match[1] as string;
          if (/^(https?:|mailto:|#)/.test(raw)) continue;
          const path = decodeURIComponent(raw.split('#')[0] ?? '');
          if (path === '') continue;
          if (!existsSync(resolve(dirname(file), path))) {
            broken.push({ file: relative(process.cwd(), file), line: index + 1, target: raw });
          }
        }
      });
  }
  return broken;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/check-doc-links.ts');
if (invokedDirectly) {
  const broken = findBrokenLinks(['docs', 'README.md']);
  for (const b of broken) console.error(`broken link: ${b.file}:${b.line} -> ${b.target}`);
  if (broken.length > 0) {
    console.error('doc link check FAILED');
    process.exit(1);
  }
  console.log('doc link check OK');
}
