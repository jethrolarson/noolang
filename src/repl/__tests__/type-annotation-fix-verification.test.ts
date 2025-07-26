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

describe('Type Annotation Fix Verification', () => {
	let repl: REPL;

	beforeEach(() => {
		jest.clearAllMocks();
		repl = new REPL();
	});

	afterAll(() => {
		global.console = originalConsole;
	});

	describe('Fixed Type Annotations', () => {
		test('basic type annotations should work', () => {
			expect(() => {
				repl.processInput('x = 42 : Int');
			}).not.toThrow();
		});

		test('function type annotations should work', () => {
			expect(() => {
				repl.processInput('add = fn x y => x + y : Int -> Int -> Int');
			}).not.toThrow();
		});

		test('list type annotations should work', () => {
			expect(() => {
				repl.processInput('numbers = [1, 2, 3] : List Int');
			}).not.toThrow();
		});

		test('record type annotations should work with @field syntax', () => {
			expect(() => {
				repl.processInput('person = { @name "Alice", @age 30 } : { @name String, @age Int }');
			}).not.toThrow();
		});

		test('constraint type annotations should work', () => {
			expect(() => {
				repl.processInput('head = fn list => head list : List a -> a given a is Collection');
			}).not.toThrow();
		});

		test('sequential expressions with type annotations should work', () => {
			expect(() => {
				repl.processInput('x = 42 : Int; x + 1');
			}).not.toThrow();
		});

		test('type mismatches should still produce errors', () => {
			expect(() => {
				repl.processInput('wrong = "hello" : Int');
			}).toThrow();
		});
	});

	describe('Type Annotation Evaluation', () => {
		test('should evaluate typed expressions correctly', () => {
			// This shouldn't throw and should work correctly
			expect(() => {
				repl.processInput('x = 42 : Int');
				repl.processInput('result = x + 8');
			}).not.toThrow();
		});

		test('should evaluate typed functions correctly', () => {
			expect(() => {
				repl.processInput('add = fn x y => x + y : Int -> Int -> Int');
				repl.processInput('result = add 2 3');
			}).not.toThrow();
		});
	});
});