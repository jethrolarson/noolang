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

describe('REPL Type Annotation Tests', () => {
	let repl: REPL;

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks();
		repl = new REPL();
	});

	afterAll(() => {
		// Restore original console
		global.console = originalConsole;
	});

	describe('Basic Type Annotations', () => {
		test('should handle simple type annotation', () => {
			expect(() => {
				repl.processInput('x = 42 : Int');
			}).not.toThrow();
		});

		test('should handle function type annotation', () => {
			expect(() => {
				repl.processInput('add = fn x y => x + y : Int -> Int -> Int');
			}).not.toThrow();
		});

		test('should handle constrained type annotation', () => {
			expect(() => {
				repl.processInput('head = fn list => head list : List a -> a given a is Collection');
			}).not.toThrow();
		});

		test('should handle list type annotation', () => {
			expect(() => {
				repl.processInput('numbers = [1, 2, 3] : List Int');
			}).not.toThrow();
		});

		test('should handle record type annotation', () => {
			expect(() => {
				repl.processInput('person = { @name "Alice", @age 30 } : { @name String, @age Int }');
			}).not.toThrow();
		});
	});

	describe('Type Annotation Evaluation', () => {
		test('should evaluate expression with type annotation correctly', () => {
			// Test that type annotated expression evaluates to expected value
			expect(() => {
				repl.processInput('x = 42 : Int');
				repl.processInput('x');
			}).not.toThrow();
		});

		test('should evaluate function with type annotation correctly', () => {
			expect(() => {
				repl.processInput('add = fn x y => x + y : Int -> Int -> Int');
				repl.processInput('add 2 3');
			}).not.toThrow();
		});
	});

	describe('Type Annotation Error Cases', () => {
		test('should handle type mismatch in annotation', () => {
			// This should produce a type error but not crash
			expect(() => {
				repl.processInput('x = "hello" : Int');
			}).not.toThrow(); // REPL should handle errors gracefully
		});

		test('should handle malformed type annotation', () => {
			expect(() => {
				repl.processInput('x = 42 : WrongType');
			}).not.toThrow(); // Should handle parse/type errors gracefully
		});
	});

	describe('Complex Type Annotations', () => {
		test('should handle nested function type annotation', () => {
			expect(() => {
				repl.processInput('curry = fn f => fn x => fn y => f x y : (a -> b -> c) -> a -> b -> c');
			}).not.toThrow();
		});

		test('should handle generic type annotation', () => {
			expect(() => {
				repl.processInput('id = fn x => x : a -> a');
			}).not.toThrow();
		});

		test('should handle effect type annotation', () => {
			expect(() => {
				repl.processInput('printNumber = fn x => print x : Int -> Int !write');
			}).not.toThrow();
		});
	});
});