import { describe, expect, it } from 'vitest';
import { findSecrets, isForbiddenFile } from '../../tools/scan-secrets.ts';

// Samples are assembled at runtime so this file does not itself look like a secret.
const hex64 = 'ab12'.repeat(16);

describe('secret scanner', () => {
  it('flags known secret shapes', () => {
    const samples: Record<string, string> = {
      'private-key-block': ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
      'github-token': 'token ' + 'gh' + 'p_' + 'A1b2'.repeat(9),
      'aws-access-key-id': 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
      'npm-token': 'npm' + '_' + 'a1B2'.repeat(9),
      'slack-token': 'xox' + 'b-' + '1234567890-abcdefghij',
      jwt: ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnop'].join('.'),
      'secret-assignment': 'const password = "' + 'hunter2hunter2' + '";',
      'hex-key-literal': 'const dbKey = "' + hex64 + '";',
    };
    for (const [rule, text] of Object.entries(samples)) {
      const rules = findSecrets('x.ts', text).map((f) => f.rule);
      expect(rules, rule).toContain(rule);
    }
  });

  it('reports file and line number', () => {
    const found = findSecrets('a/b.ts', 'ok\nok\nconst apiKey = "' + 'z'.repeat(20) + '";\n');
    expect(found).toEqual([{ file: 'a/b.ts', line: 3, rule: 'secret-assignment' }]);
  });

  it('ignores ordinary code, short values and random key generation', () => {
    const clean = [
      'const key = randomBytes(32).toString("hex");',
      'const password = req.body.password;',
      "const token = 'abc';",
      'keyHex: string;',
      'database key must be 64 hex characters',
      '// "key" is a word',
    ].join('\n');
    expect(findSecrets('x.ts', clean)).toEqual([]);
  });

  it('honours the allow marker on the same line only', () => {
    const line = 'const password = "' + 'hunter2hunter2' + '";';
    expect(findSecrets('x.ts', `${line} // secret-scan:allow`)).toEqual([]);
    expect(findSecrets('x.ts', `// secret-scan:allow\n${line}`)).toHaveLength(1);
  });

  it('flags files that must never be tracked', () => {
    for (const bad of [
      'data/app.db',
      'x/app.db-wal',
      'k.key',
      'cert.pem',
      'sign.pfx',
      '.env',
      'config/.env.production',
      'backup.hbk',
      'a\\b\\c.sqlite3',
    ]) {
      expect(isForbiddenFile(bad), bad).toBe(true);
    }
    for (const ok of [
      '.env.example',
      'src/main/index.ts',
      'docs/key-management.md',
      'keyboard.ts',
    ]) {
      expect(isForbiddenFile(ok), ok).toBe(false);
    }
  });
});
