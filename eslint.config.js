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
      'no-restricted-syntax': ['error', ...bannedSyntax],
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
