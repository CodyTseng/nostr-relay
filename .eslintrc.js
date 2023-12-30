module.exports = {
    root: true,
    env: {
      node: true,
    },
    plugins: ['@typescript-eslint/eslint-plugin'],
    extends: ['plugin:@typescript-eslint/recommended'],
    overrides: [
      {
        files: ['**/*.ts'],
        parser: '@typescript-eslint/parser',
        parserOptions: {
          project: 'tsconfig.json',
          sourceType: 'module',
        },
        rules: {
          '@typescript-eslint/interface-name-prefix': 'off',
          '@typescript-eslint/explicit-function-return-type': 'warn',
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/explicit-module-boundary-types': 'off',
          '@typescript-eslint/ban-types': 'off',
          '@typescript-eslint/no-array-constructor': 'off',
        },
      },
      {
        files: ['**/*.spec.ts', 'integration/**/*.ts'],
        parser: '@typescript-eslint/parser',
        parserOptions: {
          project: 'tsconfig.json',
          sourceType: 'module',
        },
        rules: {
          '@typescript-eslint/interface-name-prefix': 'off',
          '@typescript-eslint/explicit-function-return-type': 'off',
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/explicit-module-boundary-types': 'off',
          '@typescript-eslint/ban-types': 'off',
          '@typescript-eslint/no-empty-function': 'off',
        },
      }
    ]
  };