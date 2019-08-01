module.exports = {
  parser: 'babel-eslint',
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
    'cypress/globals': true,
  },
  plugins: ['react', 'react-hooks', 'jest', 'cypress', 'import', 'flowtype', 'emotion'],
  rules: {
    curly: ['error', 'multi-line'],
    'jsx-quotes': 'error',
    'no-trailing-spaces': 'error',
    'no-undef': 'error',
    'no-unused-expressions': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'no-unused-vars': [
      'error',
      {
        args: 'after-used',
        ignoreRestSiblings: true,
        vars: 'all',
      },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/__tests__/**/*.js',
          '**/*test.js',
          '**/tests/**/*.js',
          '**/examples/**/*.js',
          '**/build/**/*.js',
          `packages/fields/src/**/filterTests.js`,
        ],
      },
    ],
    'import/no-unresolved': 'error',
    'object-curly-spacing': ['error', 'always'],
    quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'react/jsx-boolean-value': 'warn',
    'react/jsx-no-undef': 'error',
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
    'react/jsx-wrap-multilines': 'warn',
    'react/no-did-mount-set-state': 'warn',
    'react/no-did-update-set-state': 'warn',
    'react/no-unknown-property': 'warn',
    'react/react-in-jsx-scope': 'error',
    'react/self-closing-comp': 'warn',
    'react/sort-prop-types': 'warn',
    semi: 'error',
    strict: 'off',
    // there are some special flow types that ESLint doesn't know about,
    // this stops ESLint from throwing errors
    'flowtype/define-flow-type': 'error',
    'flowtype/use-flow-type': 'error',
    'emotion/jsx-import': 'error',
    'emotion/no-vanilla': 'error',
    'emotion/import-from-emotion': 'error',
    'emotion/styled-import': 'error',
  },
  extends: ['plugin:jest/recommended'],

  // Disable some rules for (code blocks within) Markdown docs
  overrides: [
    {
      files: ['**/*.md'],
      rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off',
      },
    },
    {
      files: ['packages/fields/src/**/*.js'],
      rules: {
        'import/no-commonjs': 'error',
      },
    },
    {
      files: ['packages/build-field-types/__fixtures__/**/*.js'],
      rules: {
        'import/no-unresolved': 'off',
      },
    },
    {
      files: ['packages/app-admin-ui/**/*.ts', 'packages/app-admin-ui/**/*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: 'packages/app-admin-ui/',
      },
      plugins: [
        '@typescript-eslint',
        'react',
        'react-hooks',
        'jest',
        'cypress',
        'import',
        'emotion',
      ],
      extends: [
        'plugin:jest/recommended',
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      rules: {
        '@typescript-eslint/indent': 'off',
        '@typescript-eslint/prefer-interface': 'off',
        'import/no-unresolved': 'off',
        '@typescript-eslint/explicit-member-accessibility': 'off',
      },
    },
  ],
};
