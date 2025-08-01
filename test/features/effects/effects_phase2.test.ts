// Phase 2 Effects System Tests
// Testing separated effects in TypeResult and effect composition

import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import {
	typeProgram,
	emptyEffects,
	singleEffect,
	unionEffects,
} from '../../../src/typer';
import type { Effect } from '../../../src/ast';

const runNoolang = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	return typeProgram(program);
};

// Test suite: Effects Phase 2: Separated Effects Architecture
// Test suite: Effect Helper Functions
test('emptyEffects creates empty effect set', () => {
	const effects = emptyEffects();
	assert.is(effects.size, 0);
});

test('singleEffect creates single effect set', () => {
	const effects = singleEffect('read');
	assert.is(effects.size, 1);
	assert.is(effects.has('read'), true);
});

test('unionEffects combines multiple effect sets', () => {
	const effects1 = singleEffect('read' as Effect);
	const effects2 = singleEffect('log' as Effect);
	const effects3 = new Set(['state', 'read'] as Effect[]); // includes duplicate 'read'

	const combined = unionEffects(effects1, effects2, effects3);
	assert.is(combined.size, 3);
	assert.is(combined.has('read'), true);
	assert.is(combined.has('log'), true);
	assert.is(combined.has('state'), true);
});

// Test suite: Pure Expressions Return Empty Effects
test('literals have no effects', () => {
	const result = runNoolang('42');
	assert.is(result.effects.size, 0);
});

test('pure functions have no effects', () => {
	const result = runNoolang('fn x => x + 1');
	assert.is(result.effects.size, 0);
});

test('pure function application has no effects', () => {
	const result = runNoolang('sum = fn x y => x + y; sum 2 3');
	assert.is(result.effects.size, 0);
});

test('pure conditionals have no effects', () => {
	const result = runNoolang('if True then 1 else 2');
	assert.is(result.effects.size, 0);
});

test('pure lists have no effects', () => {
	const result = runNoolang('[1, 2, 3]');
	assert.is(result.effects.size, 0);
});

test('pure records have no effects', () => {
	const result = runNoolang('{ @name "Alice", @age 30 }');
	assert.is(result.effects.size, 0);
});

test('pure tuples have no effects', () => {
	const result = runNoolang('{1, 2, 3}');
	assert.is(result.effects.size, 0);
});

test('pure pattern matching has no effects', () => {
	const result = runNoolang(`
				type Color = Red | Green | Blue;
				color = Red;
				match color with (Red => 1; Green => 2; Blue => 3)
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Type System Returns TypeResult with Effects
test('typeProgram returns TypeResult with type and effects', () => {
	const result = runNoolang('42');
	assert.ok(result.hasOwnProperty('type'));
	assert.ok(result.hasOwnProperty('effects'));
	assert.ok(result.hasOwnProperty('state'));
	assert.is(result.type.kind, 'primitive');
	assert.ok(result.effects instanceof Set);
});

test('complex expressions return proper TypeResult structure', () => {
	const result = runNoolang(`
				sum = fn x y => x + y;
				mult = fn a b => a * b;
				compute = fn x => sum (mult x 2) 3;
				compute 5
			`);
	assert.is(result.type.kind, 'primitive');
	if (result.type.kind === 'primitive') {
		assert.is(result.type.name, 'Float');
	}
	assert.is(result.effects.size, 0);
});

// Test suite: Effect Propagation in Sequences
test('sequences collect effects from all statements', () => {
	// Note: We don't have actual effectful built-ins yet, so this tests the infrastructure
	const result = runNoolang('x = 1; y = 2; x + y');
	assert.is(result.effects.size, 0); // All pure operations
});

test('sequences with pure operations have no effects', () => {
	const result = runNoolang(`
				a = 10;
				b = 20;
				c = 30;
				a + b + c
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Effect Propagation in Function Applications
test('function application with pure function and pure arguments has no effects', () => {
	const result = runNoolang(`
				sum = fn x y => x + y;
				sum (1 + 2) (3 * 4)
			`);
	assert.is(result.effects.size, 0);
});

test('curried function application propagates effects correctly', () => {
	const result = runNoolang(`
				curry = fn f => fn x => fn y => f x y;
				sum = fn x y => x + y;
				curriedSum = curry sum;
				curriedSum 1 2
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Effect Propagation in Conditionals
test('conditional with pure branches has no effects', () => {
	const result = runNoolang(`
				condition = True;
				if condition then 1 + 2 else 3 * 4
			`);
	assert.is(result.effects.size, 0);
});

test('nested conditionals with pure expressions have no effects', () => {
	const result = runNoolang(`
				x = 5;
				if x > 0 then (if x > 10 then 100 else 50) else 0
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Effect Propagation in Data Structures
test('lists with pure elements have no effects', () => {
	const result = runNoolang(`
				increment = fn x => x + 1;
				[increment 1, increment 2, increment 3]
			`);
	assert.is(result.effects.size, 0);
});

test('records with pure field values have no effects', () => {
	const result = runNoolang(`
				compute = fn x => x * 2;
				{ @a compute 5, @b compute 10 }
			`);
	assert.is(result.effects.size, 0);
});

test('tuples with pure elements have no effects', () => {
	const result = runNoolang(`
				double = fn x => x * 2;
				{double 1, double 2, double 3}
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Effect Propagation in Pipeline Operations
test('pipeline with pure functions has no effects', () => {
	const result = runNoolang(`
				double = fn x => x * 2;
				add5 = fn x => x + 5;
				compose = fn f => fn g => fn x => f (g x);
				pipeline = compose add5 double;
				pipeline 10
			`);
	assert.is(result.effects.size, 0);
});

test('thrush operator with pure functions has no effects', () => {
	const result = runNoolang(`
				double = fn x => x * 2;
				10 | double
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Effect Propagation in Pattern Matching
test('pattern matching with pure cases has no effects', () => {
	const result = runNoolang(`
				type Option a = Some a | None;
				opt = Some 42;
				match opt with (
					Some x => x * 2;
					None => 0
				)
			`);
	assert.is(result.effects.size, 0);
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
	assert.is(result.effects.size, 0);
});

// Test suite: Functions Inherit Effects from Body
test('function with pure body has no effects', () => {
	const result = runNoolang('fn x => x + 1');
	assert.is(result.effects.size, 0);
});

test('function with complex pure body has no effects', () => {
	const result = runNoolang(`
				fn x => if x > 0 then x * 2 else x + 1
			`);
	assert.is(result.effects.size, 0);
});

test('function with pure function calls in body has no effects', () => {
	const result = runNoolang(`
				helper = fn y => y * 3;
				fn x => helper (x + 1)
			`);
	assert.is(result.effects.size, 0);
});

// Test suite: Type System Architecture Validation
test('TypeResult structure is consistent across all expression types', () => {
	const expressions = [
		{ code: '42', expectedKind: 'primitive' },
		{ code: '"hello"', expectedKind: 'primitive' },
		{ code: 'True', expectedKind: 'variant' }, // Boolean is a variant type
		{ code: 'fn x => x', expectedKind: 'function' },
		{ code: '[1, 2, 3]', expectedKind: 'list' },
		{ code: '{ @a 1, @b 2 }', expectedKind: 'record' },
		{ code: '{1, 2}', expectedKind: 'tuple' },
		{ code: 'if True then 1 else 2', expectedKind: 'primitive' },
		{ code: '1 + 2', expectedKind: 'primitive' },
		{ code: 'head [1, 2, 3]', expectedKind: 'variant' }, // Option type is variant
	];

	for (const { code, expectedKind } of expressions) {
		const result = runNoolang(code);
		assert.ok(result.hasOwnProperty('type'));
		assert.ok(result.hasOwnProperty('effects'));
		assert.ok(result.hasOwnProperty('state'));
		assert.is(result.type.kind, expectedKind);
		assert.ok(result.effects instanceof Set);
	}
});

test('effects are properly typed as Set<Effect>', () => {
	const result = runNoolang('42');
	assert.ok(result.effects instanceof Set);
	// Verify we can use Set methods
	assert.is(typeof result.effects.has, 'function');
	assert.is(typeof result.effects.add, 'function');
	assert.is(result.effects.size, 0);
});

test.run();
