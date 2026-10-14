import { defineConfig, globalIgnores } from 'eslint/config';
import { FlatCompat } from '@eslint/eslintrc';
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**']),
  {
    files: ['backend/src/**/*.ts', 'backend/test/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './backend/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': typescriptEslintPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...compat.extends('next/core-web-vitals').map((config) => ({
    ...config,
    settings: {
      ...config.settings,
      next: { ...config.settings?.next, rootDir: '_legacy-web/' },
    },
  })),
]);
