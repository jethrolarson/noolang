// Phase 2 Effects System Tests
// Testing separated effects in TypeResult and effect composition

import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { typeProgram, emptyEffects, singleEffect, unionEffects } from '../src/typer';
import type { Effect } from '../src/ast';

const runNoolang = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	return typeProgram(program);
};

describe('Effects Phase 2: Separated Effects Architecture', () => {
	describe('Effect Helper Functions', () => {
		test('emptyEffects creates empty effect set', () => {
			const effects = emptyEffects();
			expect(effects.size).toBe(0);
		});

		test('singleEffect creates single effect set', () => {
			const effects = singleEffect('io');
			expect(effects.size).toBe(1);
			expect(effects.has('io')).toBe(true);
		});

		test('unionEffects combines multiple effect sets', () => {
			const effects1 = singleEffect('io' as Effect);
			const effects2 = singleEffect('log' as Effect);
			const effects3 = new Set(['mut', 'io'] as Effect[]); // includes duplicate 'io'
			
			const combined = unionEffects(effects1, effects2, effects3);
			expect(combined.size).toBe(3);
			expect(combined.has('io')).toBe(true);
			expect(combined.has('log')).toBe(true);
			expect(combined.has('mut')).toBe(true);
		});
	});

	describe('Pure Expressions Return Empty Effects', () => {
		test('literals have no effects', () => {
			const result = runNoolang('42');
			expect(result.effects.size).toBe(0);
		});

		test('pure functions have no effects', () => {
			const result = runNoolang('fn x => x + 1');
			expect(result.effects.size).toBe(0);
		});

		test('pure function application has no effects', () => {
			const result = runNoolang('add = fn x y => x + y; add 2 3');
			expect(result.effects.size).toBe(0);
		});

		test('pure conditionals have no effects', () => {
			const result = runNoolang('if True then 1 else 2');
			expect(result.effects.size).toBe(0);
		});

		test('pure lists have no effects', () => {
			const result = runNoolang('[1, 2, 3]');
			expect(result.effects.size).toBe(0);
		});

		test('pure records have no effects', () => {
			const result = runNoolang('{ @name "Alice", @age 30 }');
			expect(result.effects.size).toBe(0);
		});

		test('pure tuples have no effects', () => {
			const result = runNoolang('{1, 2, 3}');
			expect(result.effects.size).toBe(0);
		});

		test('pure pattern matching has no effects', () => {
			const result = runNoolang(`
				type Color = Red | Green | Blue;
				color = Red;
				match color with (Red => 1; Green => 2; Blue => 3)
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Type System Returns TypeResult with Effects', () => {
		test('typeProgram returns TypeResult with type and effects', () => {
			const result = runNoolang('42');
			expect(result).toHaveProperty('type');
			expect(result).toHaveProperty('effects');
			expect(result).toHaveProperty('state');
			expect(result.type.kind).toBe('primitive');
			expect(result.effects).toBeInstanceOf(Set);
		});

		test('complex expressions return proper TypeResult structure', () => {
			const result = runNoolang(`
				add = fn x y => x + y;
				multiply = fn a b => a * b;
				compute = fn x => add (multiply x 2) 3;
				compute 5
			`);
			expect(result.type.kind).toBe('primitive');
			if (result.type.kind === 'primitive') {
				expect(result.type.name).toBe('Int');
			}
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Effect Propagation in Sequences', () => {
		test('sequences collect effects from all statements', () => {
			// Note: We don't have actual effectful built-ins yet, so this tests the infrastructure
			const result = runNoolang('x = 1; y = 2; x + y');
			expect(result.effects.size).toBe(0); // All pure operations
		});

		test('sequences with pure operations have no effects', () => {
			const result = runNoolang(`
				a = 10;
				b = 20;
				c = 30;
				a + b + c
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Effect Propagation in Function Applications', () => {
		test('function application with pure function and pure arguments has no effects', () => {
			const result = runNoolang(`
				add = fn x y => x + y;
				add (1 + 2) (3 * 4)
			`);
			expect(result.effects.size).toBe(0);
		});

		test('curried function application propagates effects correctly', () => {
			const result = runNoolang(`
				curry = fn f => fn x => fn y => f x y;
				add = fn x y => x + y;
				curriedAdd = curry add;
				curriedAdd 1 2
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Effect Propagation in Conditionals', () => {
		test('conditional with pure branches has no effects', () => {
			const result = runNoolang(`
				condition = True;
				if condition then 1 + 2 else 3 * 4
			`);
			expect(result.effects.size).toBe(0);
		});

		test('nested conditionals with pure expressions have no effects', () => {
			const result = runNoolang(`
				x = 5;
				if x > 0 then (if x > 10 then 100 else 50) else 0
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Effect Propagation in Data Structures', () => {
		test('lists with pure elements have no effects', () => {
			const result = runNoolang(`
				add = fn x => x + 1;
				[add 1, add 2, add 3]
			`);
			expect(result.effects.size).toBe(0);
		});

		test('records with pure field values have no effects', () => {
			const result = runNoolang(`
				compute = fn x => x * 2;
				{ @a compute 5, @b compute 10 }
			`);
			expect(result.effects.size).toBe(0);
		});

		test('tuples with pure elements have no effects', () => {
			const result = runNoolang(`
				double = fn x => x * 2;
				{double 1, double 2, double 3}
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Effect Propagation in Pipeline Operations', () => {
		test('pipeline with pure functions has no effects', () => {
			const result = runNoolang(`
				double = fn x => x * 2;
				add5 = fn x => x + 5;
				compose = fn f => fn g => fn x => f (g x);
				pipeline = compose add5 double;
				pipeline 10
			`);
			expect(result.effects.size).toBe(0);
		});

		test('thrush operator with pure functions has no effects', () => {
			const result = runNoolang(`
				double = fn x => x * 2;
				10 | double
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Effect Propagation in Pattern Matching', () => {
		test('pattern matching with pure cases has no effects', () => {
			const result = runNoolang(`
				type Option a = Some a | None;
				opt = Some 42;
				match opt with (
					Some x => x * 2;
					None => 0
				)
			`);
			expect(result.effects.size).toBe(0);
		});

		test('nested pattern matching with pure expressions has no effects', () => {
			const result = runNoolang(`
				type Result a b = Ok a | Err b;
				type Option a = Some a | None;
				
				result = Ok (Some 42);
				match result with (
					Ok opt => match opt with (Some x => x; None => 0);
					Err e => -1
				)
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Functions Inherit Effects from Body', () => {
		test('function with pure body has no effects', () => {
			const result = runNoolang('fn x => x + 1');
			expect(result.effects.size).toBe(0);
		});

		test('function with complex pure body has no effects', () => {
			const result = runNoolang(`
				fn x => if x > 0 then x * 2 else x + 1
			`);
			expect(result.effects.size).toBe(0);
		});

		test('function with pure function calls in body has no effects', () => {
			const result = runNoolang(`
				helper = fn y => y * 3;
				fn x => helper (x + 1)
			`);
			expect(result.effects.size).toBe(0);
		});
	});

	describe('Type System Architecture Validation', () => {
		test('TypeResult structure is consistent across all expression types', () => {
			const expressions = [
				'42',
				'"hello"',
				'True',
				'fn x => x',
				'[1, 2, 3]',
				'{ @a 1, @b 2 }',
				'{1, 2}',
				'if True then 1 else 2',
				'1 + 2',
				'head [1, 2, 3]'
			];

			for (const expr of expressions) {
				const result = runNoolang(expr);
				expect(result).toHaveProperty('type');
				expect(result).toHaveProperty('effects');
				expect(result).toHaveProperty('state');
				expect(result.effects).toBeInstanceOf(Set);
			}
		});

		test('effects are properly typed as Set<Effect>', () => {
			const result = runNoolang('42');
			expect(result.effects).toBeInstanceOf(Set);
			// Verify we can use Set methods
			expect(typeof result.effects.has).toBe('function');
			expect(typeof result.effects.add).toBe('function');
			expect(result.effects.size).toBe(0);
		});
	});
});