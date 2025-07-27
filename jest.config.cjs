const fs = require('fs');
const path = require('path');

// Read migrated tests from JSON file
const getMigratedTests = () => {
	try {
		const migratedTestsPath = path.join(__dirname, 'uvu-migrated-tests.json');
		const migratedTestsData = JSON.parse(fs.readFileSync(migratedTestsPath, 'utf8'));
		return migratedTestsData.migratedFiles || [];
	} catch (error) {
		console.warn('Warning: Could not read uvu-migrated-tests.json, using empty list');
		return [];
	}
};

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
	testPathIgnorePatterns: getMigratedTests(),
};
