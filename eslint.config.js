// SILENT DEPTH — ESLint flat config (eslint.config.js)
//
// TypeScript + vitest-aware linting for an ESM, headless-first project.
// Config is flat (ESLint >= 9). Style enforcement is delegated to Prettier
// (see .prettierrc.json) — ESLint handles correctness/lint rules only.
//
// Targets:
//   - src/**       engine + UI + sim (browser + Node-compatible strict TS)
//   - tests/**     vitest suites (jest-like globals enabled)
//   - configs      tsconfig / vite / vitest config files (Node context)
//   - scripts      dev tooling

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'assets/**', 'reports/**', 'factory/**'],
  },

  // ---- base JS rules (all TS source) ----
  js.configs.recommended,

  // ---- TypeScript rules ----
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'error',
    },
  },

  // ---- vitest test files ----
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Tests frequently call a sim step purely for its side effects without
      // reading the returned snapshot (e.g. `snap = step(...)` in a loop that
      // only advances state). Allow that pattern here; src/ stays strict.
      'no-useless-assignment': 'off',
    },
  },

  // ---- Node config / script files ----
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ---- .mjs tool scripts (Node.js ESM + browser globals for page.evaluate) ----
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      sourceType: 'module',
    },
  },
);
