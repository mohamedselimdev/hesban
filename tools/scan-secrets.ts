import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
}

const ALLOW_MARKER = 'secret-scan:allow';

const RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  {
    rule: 'private-key-block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  { rule: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { rule: 'github-fine-grained-token', pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { rule: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { rule: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    rule: 'secret-assignment',
    pattern:
      /(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|db[_-]?key)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
  {
    rule: 'hex-key-literal',
    pattern: /(?:key|secret)\w*\s*[:=]\s*['"](?:x')?[0-9a-f]{64}['"]/i,
  },
];

const FORBIDDEN_FILE = [
  /\.(db|db-wal|db-shm|sqlite|sqlite3|key|pem|pfx|p12|hbk)$/i,
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/i,
];

const SKIP_CONTENT = new Set(['pnpm-lock.yaml', 'package-lock.json']);

export function isForbiddenFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return FORBIDDEN_FILE.some((p) => p.test(normalized));
}

/** Test fixtures use obviously fake passwords; token shapes and key literals are still checked there. */
const FIXTURE_EXEMPT_RULES = new Set(['secret-assignment']);

export function findSecrets(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const inTests = file.split('\\').join('/').startsWith('tests/');
  text.split(/\r?\n/).forEach((lineText, index) => {
    if (lineText.includes(ALLOW_MARKER)) return;
    for (const { rule, pattern } of RULES) {
      if (inTests && FIXTURE_EXEMPT_RULES.has(rule)) continue;
      if (pattern.test(lineText)) findings.push({ file, line: index + 1, rule });
    }
  });
  return findings;
}

function listFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
    },
  );
  return out.split('\0').filter(Boolean);
}

function isProbablyText(buffer: Buffer): boolean {
  return !buffer.subarray(0, 8000).includes(0);
}

export function scanRepository(): { findings: Finding[]; forbidden: string[]; scanned: number } {
  const findings: Finding[] = [];
  const forbidden: string[] = [];
  let scanned = 0;
  for (const file of listFiles()) {
    if (isForbiddenFile(file)) forbidden.push(file);
    const base = file.split('/').pop() ?? file;
    if (SKIP_CONTENT.has(base)) continue;
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > 2_000_000) continue;
    const buffer = readFileSync(file);
    if (!isProbablyText(buffer)) continue;
    scanned++;
    findings.push(...findSecrets(file, buffer.toString('utf8')));
  }
  return { findings, forbidden, scanned };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/scan-secrets.ts');
if (invokedDirectly) {
  const { findings, forbidden, scanned } = scanRepository();
  for (const f of forbidden) console.error(`forbidden file tracked or unignored: ${f}`);
  for (const f of findings) console.error(`possible secret: ${f.file}:${f.line} (${f.rule})`);
  if (findings.length > 0 || forbidden.length > 0) {
    console.error('secret scan FAILED');
    process.exit(1);
  }
  console.log(`secret scan OK (${scanned} text files scanned)`);
}
