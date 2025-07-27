module.exports = {
	testEnvironment: 'node',

	// Performance optimizations
	maxWorkers: '50%', // Use half the available CPU cores

	// Use SWC for ultra-fast TypeScript compilation
	transform: {
		'^.+\\.(ts|tsx)$': '@swc/jest',
	},

	moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
	roots: ['<rootDir>/src', '<rootDir>/test'],

	// Caching optimizations
	cache: true,
	cacheDirectory: '<rootDir>/.jest-cache',

	// Coverage optimization (only if coverage is needed)
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/**/__tests__/**',
		'!src/**/*.test.{ts,tsx}',
	],

	// Speed up module resolution
	modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],

	// Skip unnecessary transformations
	transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],

	// Faster test detection
	testMatch: [
		'<rootDir>/test/**/*.test.{ts,tsx}',
		'<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
		'<rootDir>/src/**/*.test.{ts,tsx}',
	],

	// Exclude files that have been migrated to uvu
	testPathIgnorePatterns: [
		'/node_modules/',
		'test/language-features/record_tuple_unit.test.ts', // Migrated to uvu
		'test/language-features/tuple.test.ts', // Migrated to uvu
		'test/language-features/closure.test.ts', // Migrated to uvu
		'test/type-system/option_unification.test.ts', // Migrated to uvu
		'test/integration/import_relative.test.ts', // Migrated to uvu
		'test/language-features/head_function.test.ts', // Migrated to uvu
	],
};
