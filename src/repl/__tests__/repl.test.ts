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
	describe('REPL Instance', () => {
		test('should create REPL instance', () => {
			const repl = new REPL();
			expect(repl).toBeInstanceOf(REPL);
		});

		test('should have evaluator property', () => {
			const repl = new REPL();
			expect((repl as any).evaluator).toBeDefined();
		});

		test('should have typeState property', () => {
			const repl = new REPL();
			expect((repl as any).typeState).toBeDefined();
		});

		test('should have readline interface', () => {
			const repl = new REPL();
			expect((repl as any).rl).toBeDefined();
		});
	});

	describe('Basic Functionality', () => {
		test('should handle empty input', () => {
			const repl = new REPL();
			const processInput = (repl as any).processInput.bind(repl);
			expect(() => processInput('')).not.toThrow();
		});

		test('should handle command input', () => {
			const repl = new REPL();
			const processInput = (repl as any).processInput.bind(repl);
			expect(() => processInput('.help')).not.toThrow();
		});

		test('should handle unknown command', () => {
			const repl = new REPL();
			const processInput = (repl as any).processInput.bind(repl);
			expect(() => processInput('.unknown')).not.toThrow();
		});
	});
});
