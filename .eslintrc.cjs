/** @type {import('eslint').Linter.Config} */
//
// PKC2 ESLint baseline (Tier 3-3 realignment, 2026-04-14).
//
// Rationale: docs/development/lint-baseline-realignment.md.
// Canonical layer policy: CLAUDE.md §Architecture — 5-Layer Structure.
//
// Direction of legal imports:
//   core/      ← features/ ← adapter/ ← UI (presenters / renderer / action-binder)
//                                    ← main.ts (bootstrap / wire)
//   runtime/   ← adapter/
//
// Forbidden:
//   - core/**    imports from adapter/, features/, runtime/, or browser globals
//   - features/** imports from adapter/, runtime/, or browser globals (core-only)
//   - runtime/** imports from adapter/, features/, core/ (build-time constants only)
//
// Explicitly legal (was wrongly forbidden pre-Tier-3-3):
//   - adapter/** imports from features/   (adapter orchestrates features)
//   - adapter/** imports from core/
//   - adapter/** imports from runtime/
//
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // `_` prefix means "intentionally unused". Applies to both args
    // and bindings so that test fixtures using `const _lid = ...`
    // for narrative clarity don't trip the rule.
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    // core/ — pure domain model. No browser APIs, no upward layer
    // references. Unchanged from pre-Tier-3-3.
    {
      files: ['src/core/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: [
                '**/adapter/*', '**/adapter/**',
                '**/features/*', '**/features/**',
                '**/runtime/*', '**/runtime/**',
                '@adapter/*', '@features/*', '@runtime/*',
              ],
              message: 'core/ must not import from adapter/, features/, or runtime/.',
            },
          ],
        }],
        'no-restricted-globals': ['error',
          { name: 'document', message: 'core/ must not access browser DOM.' },
          { name: 'window', message: 'core/ must not access browser globals.' },
          { name: 'navigator', message: 'core/ must not access browser globals.' },
          { name: 'localStorage', message: 'core/ must not access browser storage.' },
          { name: 'sessionStorage', message: 'core/ must not access browser storage.' },
          { name: 'indexedDB', message: 'core/ must not access browser storage.' },
          { name: 'fetch', message: 'core/ must not access network APIs.' },
          { name: 'XMLHttpRequest', message: 'core/ must not access network APIs.' },
        ],
      },
    },

    // features/ — pure algorithmic helpers. Imports from core only.
    // Must not reach into adapter/ or runtime/, and must not touch
    // browser globals (features may run under Node during tests).
    // New in Tier 3-3: previously this layer was unenforced, which
    // was a latent drift vector. The current codebase already
    // satisfies this rule — adding it pins the contract.
    {
      files: ['src/features/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: [
                '**/adapter/*', '**/adapter/**',
                '**/runtime/*', '**/runtime/**',
                '@adapter/*', '@runtime/*',
              ],
              message: 'features/ may import from core/ only (CLAUDE.md §Architecture).',
            },
          ],
        }],
      },
    },

    // runtime/ — build constants + DOM slot contracts. Tiny layer.
    // Must not import from the rest of the source tree.
    {
      files: ['src/runtime/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: [
                '**/core/*', '**/core/**',
                '**/features/*', '**/features/**',
                '**/adapter/*', '**/adapter/**',
                '@core/*', '@features/*', '@adapter/*',
              ],
              message: 'runtime/ is leaf-layer; do not import from core/, features/, or adapter/.',
            },
          ],
        }],
      },
    },

    // adapter/ — the orchestration layer. Intentionally has NO
    // import restriction: it may legitimately pull from core/,
    // features/, and runtime/. See CLAUDE.md §Architecture.
    // (Pre-Tier-3-3 this block mistakenly forbade features/ imports,
    // which was 83 of the 91 pre-existing lint errors.)
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'build/'],
};
