import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findBrokenLinks } from '../../tools/check-doc-links.ts';

describe('doc link checker', () => {
  it('reports missing targets, ignores URLs and anchors, accepts existing files and folders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hesban-links-'));
    try {
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'a.md'), 'x');
      writeFileSync(
        join(dir, 'index.md'),
        [
          '[ok](a.md)',
          '[ok anchor](a.md#section)',
          '[folder](sub)',
          '[web](https://example.com/x)',
          '[only anchor](#top)',
          '[missing](nope.md)',
          '[missing anchor](gone.md#x)',
        ].join('\n'),
      );
      const broken = findBrokenLinks([dir]).map((b) => [b.line, b.target]);
      expect(broken).toEqual([
        [6, 'nope.md'],
        [7, 'gone.md#x'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the real documentation has no broken relative links', () => {
    expect(findBrokenLinks(['docs', 'README.md'])).toEqual([]);
  });
});
