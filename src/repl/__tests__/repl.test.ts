/**
 * @jest-environment node
 * @jest-environment-options {"silent": true}
 */

// Mock console before importing REPL to prevent output pollution
const originalConsole = { ...console };
global.console = {
	...originalConsole,
	log: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};

import { REPL } from '../../repl';

// Mock readline to prevent hanging in tests
jest.mock('node:readline', () => ({
	createInterface: jest.fn().mockReturnValue({
		prompt: jest.fn(),
		on: jest.fn(),
		close: jest.fn(),
	}),
}));

describe('REPL Unit Tests', () => {
	afterAll(() => {
		// Restore original console
		global.console = originalConsole;
	});

	describe('REPL Instance', () => {
		test('should create REPL instance', () => {
			const repl = new REPL();
			expect(repl).toBeInstanceOf(REPL);
		});

		test('should have evaluator property', () => {
			const repl = new REPL();
			expect(repl.evaluator).toBeDefined();
		});

		test('should have typeState property', () => {
			const repl = new REPL();
			expect(repl.typeState).toBeDefined();
		});

		test('should have readline interface', () => {
			const repl = new REPL();
			expect(repl.rl).toBeDefined();
		});
	});

	describe('Basic Functionality', () => {
		test('should handle empty input', () => {
			const repl = new REPL();
			const processInput = repl.processInput.bind(repl);
			expect(() => processInput('')).not.toThrow();
		});

		test('should handle command input', () => {
			const repl = new REPL();
			const processInput = repl.processInput.bind(repl);
			expect(() => processInput('.help')).not.toThrow();
		});

		test('should handle unknown command', () => {
			const repl = new REPL();
			const processInput = repl.processInput.bind(repl);
			expect(() => processInput('.unknown')).not.toThrow();
		});
	});
});
