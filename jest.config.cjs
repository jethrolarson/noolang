module.exports = {
	testEnvironment: 'node',

	// Performance optimizations
	maxWorkers: '50%', // Use half the available CPU cores

	// Enable TypeScript isolation for faster compilation
	transform: {
		'^.+\.(ts|tsx)$': [
			'ts-jest',
			{
				useESM: false,
			},
		],
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
		// Migrated to uvu - exclude from Jest
		'test/language-features/record_tuple_unit.test.ts', // Migrated to uvu
		'test/language-features/tuple.test.ts', // Migrated to uvu
		'test/language-features/closure.test.ts', // Migrated to uvu
		'test/type-system/option_unification.test.ts', // Migrated to uvu
		'test/integration/import_relative.test.ts', // Migrated to uvu
		'test/language-features/head_function.test.ts', // Migrated to uvu
		'test/features/pattern-matching/pattern_matching_failures.test.ts', // Migrated to uvu
		'test/type-system/print_type_pollution.test.ts', // Migrated to uvu
		'test/features/operators/safe_thrush_operator.test.ts', // Migrated to uvu
		'test/type-system/adt_limitations.test.ts', // Migrated to uvu
		'test/features/effects/effects_phase2.test.ts', // Migrated to uvu
		'test/features/operators/dollar-operator.test.ts', // Migrated to uvu
		'test/features/effects/effects_phase3.test.ts', // Migrated to uvu
		'test/features/adt.test.ts', // Migrated to uvu
		'test/language-features/combinators.test.ts', // Migrated to uvu
	
		'src/typer/__tests__/type-display.test.ts', // Migrated to uvu
		'src/typer/__tests__/trait-system-conflicting-functions.test.ts', // Migrated to uvu
		'src/typer/__tests__/stdlib-parsing.test.ts', // Migrated to uvu],
};
