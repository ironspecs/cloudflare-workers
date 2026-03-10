import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			exclude: ['src/**/*.unit.test.ts', 'src/index.ts', 'src/index.html'],
			include: ['src/common.ts', 'src/domain/api-subscribers.ts', 'src/domain/subscription-tokens.ts', 'src/lib/**/*.ts'],
			provider: 'v8',
			thresholds: {
				branches: 85,
				functions: 90,
				lines: 90,
				statements: 90,
			},
		},
		environment: 'node',
		include: ['src/**/*.unit.test.ts'],
	},
});
