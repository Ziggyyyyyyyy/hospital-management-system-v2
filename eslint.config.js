const { FlatCompat } = require('@eslint/eslintrc')
const path = require('node:path')

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

module.exports = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'supabase/functions/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'prettier'),
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@next/next/no-html-link-for-pages': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
]
