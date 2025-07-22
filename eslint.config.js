const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
	js.configs.recommended,
	{
		files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module',
				project: './tsconfig.json',
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				global: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
		},
		rules: {
			// TypeScript specific rules
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: true,
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-explicit-any': 'warn',
			// '@typescript-eslint/prefer-const': 'error', // This rule doesn't exist
			'@typescript-eslint/no-var-requires': 'error',
			'no-unused-vars': 'off', // Use TypeScript version instead
			'no-undef': 'off', // Use TypeScript version instead

			// General rules
			'no-console': 'off',
			'no-debugger': 'error',
			'prefer-const': 'error',
			'no-var': 'error',

			// Code quality
			complexity: ['off', 10],
			// 'max-depth': ['warn', 4],
			// 'max-lines': ['warn', 300],
			// 'max-params': ['warn', 4],
		},
	},
	{
		ignores: [
			'dist/',
			'node_modules/',
			'coverage/',
			'*.js',
			'*.d.ts',
			'lsp/target/',
		],
	},
];
