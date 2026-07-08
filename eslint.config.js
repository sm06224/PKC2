// PKC2 ESLint flat config(2026-07-08、eslint 8→10 移行に伴い .eslintrc.cjs から移設)。
//
// eslint 10 は legacy `.eslintrc` サポートを撤廃したため flat config へ全面移行。
// 旧 .eslintrc.cjs の設定を **rule parity を保って** そのまま移植している。
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
//   - core/**     imports from adapter/, features/, runtime/, or browser globals
//   - features/** imports from adapter/, runtime/, or browser globals (core-only)
//   - runtime/**  imports from adapter/, features/, core/ (build-time constants only)
//
// Explicitly legal:
//   - adapter/** imports from features/ / core/ / runtime/(adapter orchestrates)

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ── ignore(旧 ignorePatterns 相当)──
  { ignores: ['dist/', 'node_modules/', 'build/'] },

  // eslint 9/10 は未使用 eslint-disable directive を既定で warn 報告するが、
  // eslint 8 baseline は既定 off だった。移行時の parity 保持のため off に固定
  // (既存の未使用 directive の掃除は別 opt-in)。
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },

  // ── base(旧 extends: eslint:recommended + @typescript-eslint/recommended)──
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── 全 TS 共通ルール(旧 rules 相当)──
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
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
      // eslint 9/10 で recommended に新規追加されたルール。本 repo は
      // `let x = null; try { x = ... } catch { ... }` の防御的初期化イディオムを
      // 多用しており(初期値は try が throw した際の fallback)、これを「useless」
      // として除去すると TS の「使用前未代入」に抵触する。旧 eslint 8 baseline に
      // 存在しなかったルールのため、parity 保持として off(採用は別途 opt-in 判断)。
      'no-useless-assignment': 'off',
    },
  },

  // ── core/ — pure domain model. No browser APIs, no upward layer references. ──
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

  // ── features/ — pure algorithmic helpers. Imports from core only. ──
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

  // ── runtime/ — build constants + DOM slot contracts. Leaf layer. ──
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

  // adapter/ — orchestration layer. No import restriction(意図的、CLAUDE.md §Architecture)。
);
