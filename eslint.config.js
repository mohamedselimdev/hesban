import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const bannedSyntax = [
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is banned.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'out-ui/**',
      'out-probe/**',
      'release/**',
      'coverage/**',
      'docs/**',
      'tools/spikes/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        ...bannedSyntax,
        {
          selector: 'TSAsExpression[typeAnnotation.typeName.name=/^(Piastres|Milli)$/]',
          message:
            'Do not cast to Piastres/Milli; use piastres()/milli() or the money/qty functions.',
        },
        {
          selector: 'TSTypeAssertion[typeAnnotation.typeName.name=/^(Piastres|Milli)$/]',
          message:
            'Do not cast to Piastres/Milli; use piastres()/milli() or the money/qty functions.',
        },
      ],
    },
  },
  {
    // The only files allowed to create branded money/quantity values by cast.
    files: ['src/domain/money.ts', 'src/domain/qty.ts'],
    rules: { 'no-restricted-syntax': ['error', ...bannedSyntax] },
  },
  {
    // Only the infrastructure, main process and tooling may touch the file system or processes.
    files: [
      'src/domain/**/*.ts',
      'src/application/**/*.ts',
      'src/shared/**/*.ts',
      'src/renderer/**/*.{ts,tsx}',
      'src/preload/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'fs',
                'fs/*',
                'node:fs',
                'node:fs/*',
                'child_process',
                'node:child_process',
                'node:worker_threads',
                'worker_threads',
                'node:net',
                'net',
                'node:http',
                'node:https',
                'http',
                'https',
              ],
              message: 'File, process and network access belong in src/infrastructure or src/main.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // Domain layer is pure: no I/O, no framework, no outer layers.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/application/**',
                '**/infrastructure/**',
                '**/main/**',
                '**/renderer/**',
                '**/preload/**',
              ],
              message: 'Domain must not import outer layers.',
            },
            {
              group: ['electron', 'node:*', 'fs', 'path', 'child_process'],
              message: 'Domain must be pure.',
            },
          ],
        },
      ],
    },
  },
);
