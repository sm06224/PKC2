/** @type {import('eslint').Linter.Config} */
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
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    // core/ must not depend on adapter, features, runtime, or browser globals
    {
      files: ['src/core/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['**/adapter/*', '**/adapter/**', '**/features/*', '**/features/**', '**/runtime/*', '**/runtime/**', '@adapter/*', '@features/*', '@runtime/*'],
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
    // adapter/ must not depend on features/
    {
      files: ['src/adapter/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['**/features/*', '**/features/**', '@features/*'],
              message: 'adapter/ must not import from features/.',
            },
          ],
        }],
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'build/'],
};
