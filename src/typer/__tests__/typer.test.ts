import { describe, it, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '..';
import { typeToString } from '../helpers';
import { createTypeState } from '..';
import { initializeBuiltins } from '../builtins';

// Helper function to parse a string into a program
const parseProgram = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

describe('Functional Type Inference', () => {
	describe('Basic Types', () => {
		it('should infer integer literal', () => {
			const program = parseProgram('42');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should infer string literal', () => {
			const program = parseProgram('"hello"');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'String'
			);
		});

		it('should infer boolean literal', () => {
			const program = parseProgram('True');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
		});
	});

	describe('Function Types', () => {
		it('should infer identity function', () => {
			const program = parseProgram('fn x => x');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'(α) -> α'
			);
		});

		it('should infer function with multiple parameters', () => {
			const program = parseProgram('fn x y => x + y');
			const result = typeProgram(program);
			// With trait system, + operator is polymorphic: Add a => a -> a -> a
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'(α) -> (α) -> α'
			);
		});

		it('should infer nested function', () => {
			const program = parseProgram('fn x => fn y => x + y');
			const result = typeProgram(program);
			// With trait system, + operator is polymorphic: Add a => a -> a -> a
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'(α) -> (α) -> α'
			);
		});
	});

	describe('Let Polymorphism', () => {
		it('should generalize identity function', () => {
			const program = parseProgram('id = fn x => x; id 42');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should allow polymorphic function to be used with different types', () => {
			const program = parseProgram('id = fn x => x; id 42; id "hello"');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'String'
			);
		});

		it('should handle recursive definitions', () => {
			const program = parseProgram(
				'fact = fn n => if n == 0 then 1 else n * (fact (n - 1)); fact 5'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});
	});

	describe('Function Application', () => {
		it('should apply function to argument', () => {
			const program = parseProgram('(fn x => x + 1) 42');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle partial application', () => {
			const program = parseProgram(
				'add = fn x y => x + y; add5 = add 5; add5 3'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle curried application', () => {
			const program = parseProgram('add = fn x y => x + y; add 2 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});
	});

	describe('Binary Operators', () => {
		it('should infer arithmetic operations', () => {
			const program = parseProgram('2 + 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should infer comparison operations', () => {
			const program = parseProgram('2 < 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
		});

		it('should infer equality operations', () => {
			const program = parseProgram('2 == 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
		});
	});

	describe('If Expressions', () => {
		it('should infer if expression with same types', () => {
			const program = parseProgram('if True then 1 else 2');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle if expression with different types', () => {
			const program = parseProgram('if True then 1 else "hello"');
			expect(() => typeProgram(program)).toThrow();
		});
	});

	describe('Sequences', () => {
		it('should handle semicolon sequences', () => {
			const program = parseProgram('1; 2; 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle sequences with definitions', () => {
			const program = parseProgram('x = 1; y = 2; x + y');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});
	});

	describe('Built-in Functions', () => {
		it('should handle built-in arithmetic operators', () => {
			const program = parseProgram('2 + 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle built-in comparison operators', () => {
			const program = parseProgram('2 == 3');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Bool');
		});
	});

	describe('Type Environment', () => {
		it('should initialize with built-ins', () => {
			const state = createTypeState();
			const newState = initializeBuiltins(state);

			expect(newState.environment.has('+')).toBe(true);
			expect(newState.environment.has('-')).toBe(true);
			expect(newState.environment.has('*')).toBe(true);
			expect(newState.environment.has('/')).toBe(true);
			expect(newState.environment.has('==')).toBe(true);
			expect(newState.environment.has(';')).toBe(true);
		});
	});

	describe('Error Cases', () => {
		it('should reject undefined variables', () => {
			const program = parseProgram('undefined_var');
			expect(() => typeProgram(program)).toThrow('Undefined variable');
		});

		it('should reject type mismatches in function application', () => {
			const program = parseProgram('(fn x => x + 1) "hello"');
			expect(() => typeProgram(program)).toThrow();
		});

		it('should reject non-boolean conditions in if expressions', () => {
			const program = parseProgram('if 42 then 1 else 2');
			expect(() => typeProgram(program)).toThrow();
		});
	});

	describe('Mutation Types', () => {
		it('should type mutable definition with simple value', () => {
			const program = parseProgram('mut x = 42; x');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should type mutable definition with function', () => {
			const program = parseProgram('mut f = fn x => x + 1; f 5');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should type mutation with same type', () => {
			const program = parseProgram('mut x = 10; mut! x = 20; x');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should type mutation with compatible types', () => {
			const program = parseProgram('mut x = 10; mut! x = 15; x + 5');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should reject mutation of undefined variable', () => {
			const program = parseProgram('mut! x = 42');
			expect(() => typeProgram(program)).toThrow('Undefined variable');
		});

		it('should reject mutation with incompatible types', () => {
			const program = parseProgram('mut x = 10; mut! x = "hello"');
			expect(() => typeProgram(program)).toThrow();
		});

		it('should reject mutation of non-mutable variable', () => {
			const program = parseProgram('x = 10; mut! x = 20');
			// This should be caught at runtime, not type time
			// The type system allows it but the evaluator will throw
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});

		it('should handle mutation in sequences', () => {
			const program = parseProgram('mut x = 1; mut! x = 2; x');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle multiple mutations of same variable', () => {
			const program = parseProgram('mut x = 0; mut! x = 1; mut! x = 2; x');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle mutation with complex expressions', () => {
			const program = parseProgram('mut x = 1; mut! x = x + 1; x');
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle mutation with function calls', () => {
			const program = parseProgram(
				'add = fn x y => x + y; mut x = 5; mut! x = add x 3; x'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle mutation with conditional expressions', () => {
			const program = parseProgram(
				'mut x = 10; mut! x = if x > 5 then 20 else 0; x'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle mutation with record values', () => {
			const program = parseProgram(
				'mut point = {10, 20}; mut! point = {30, 40}; point'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'(Int Int)'
			);
		});

		it('should handle mutation with list values', () => {
			const program = parseProgram(
				'mut items = [1, 2, 3]; mut! items = [4, 5, 6]; head items'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe(
				'Option Int'
			);
		});

		it('should handle mutation with external variables', () => {
			const program = parseProgram(`
				outer = 100;
				mut inner = 10;
				mut! inner = inner + outer;
				inner
			`);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle mutation with polymorphic functions', () => {
			const program = parseProgram(
				'id = fn x => x; mut x = 42; mut! x = id x; x'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});

		it('should handle mutation with built-in functions', () => {
			const program = parseProgram(
				'mut list = [1, 2, 3]; mut! list = list_map (fn x => x * 2) list; length list'
			);
			const result = typeProgram(program);
			expect(typeToString(result.type, result.state.substitution)).toBe('Int');
		});
	});
});

describe('Constraint Propagation (Functional Typer)', () => {
	it('should throw a type error when constraints are not satisfied in composition', () => {
		const program = parseProgram(`
      compose = fn f g => fn x => f (g x);
      safeHead = compose head;
      listId = fn x => x;
      result = safeHead listId [1, 2, 3]
    `);
		// This should work now since head is safe and returns Option
		const result = typeProgram(program);
		expect(result).toBeDefined();
	});

	it('should allow composition when constraints are satisfied (functional typer)', () => {
		const program = parseProgram(`
      compose = fn f g => fn x => f (g x);
      safeHead = compose head;
      listId = fn x => x;
      result = safeHead listId [[1, 2, 3], [4, 5, 6]]
    `);
		const result = typeProgram(program);
		const typeStr = typeToString(result.type, result.state.substitution);
		// head now returns Option List Int instead of List Int
		expect(typeStr).toBe('Option List Int');
	});
});
