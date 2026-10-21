import { defineConfig } from 'vitest/config';

export default defineConfig( {
	test: {
		globals: true,
		include: [ 'src/**/*.test.ts', 'functions/**/*.test.ts' ],
		environment: 'node',
	},
} );
