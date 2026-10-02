import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import pluginPrettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

export default defineConfig(
	globalIgnores( [ 'node_modules/', 'dist/', 'dist-spacefast/', '.data/' ] ),
	js.configs.recommended,
	tsEslint.configs.recommended,
	pluginPrettier,
	{
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [ 'error', { argsIgnorePattern: '^_' } ],
		},
	},
	{
		files: [ 'src/**/*.test.ts' ],
		languageOptions: { globals: { ...globals.node, vi: 'readonly' } },
	}
);
