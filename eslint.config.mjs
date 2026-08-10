import eslintConfigPrettier from 'eslint-config-prettier';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Un segreto loggato per sbaglio e' un segreto bruciato: niente console
      // libera in codice applicativo.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  eslintConfigPrettier,
];

export default eslintConfig;
