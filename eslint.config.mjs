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
      // Le illustrazioni sono WebP gia' ottimizzati a mano (≤ 40 KB, misura
      // esatta di visualizzazione): `next/image` qui aggiungerebbe il servizio
      // di ottimizzazione di Vercel — che costa — per riottimizzare file gia'
      // ottimizzati. Il rischio che la regola previene non esiste in questo
      // repository, dove ogni immagine passa dal collaudo di docs/aspetto.md.
      '@next/next/no-img-element': 'off',
    },
  },
  eslintConfigPrettier,
];

export default eslintConfig;
