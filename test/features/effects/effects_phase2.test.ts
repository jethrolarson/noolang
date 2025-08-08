// Phase 2 Effects System Tests
// Testing separated effects in TypeResult and effect composition

import { emptyEffects, singleEffect, unionEffects } from '../../../src/typer';
import type { Effect } from '../../../src/ast';
import { test, expect } from 'bun:test';
import { assertPrimitiveType, runCode } from '../../utils';

// Test suite: Effects Phase 2: Separated Effects Architecture
// Test suite: Effect Helper Functions
test('emptyEffects creates empty effect set', () => {
	const effects = emptyEffects();
	expect(effects.size).toBe(0);
});

test('singleEffect creates single effect set', () => {
	const effects = singleEffect('read');
	expect(effects.size).toBe(1);
	expect(effects.has('read')).toBe(true);
});

test('unionEffects combines multiple effect sets', () => {
	const effects1 = singleEffect('read');
	const effects2 = singleEffect('log');
	const effects3 = new Set<Effect>(['state', 'read']); // includes duplicate 'read'

	const combined = unionEffects(effects1, effects2, effects3);
	expect(combined.size).toBe(3);
	expect(combined.has('read')).toBe(true);
	expect(combined.has('log')).toBe(true);
	expect(combined.has('state')).toBe(true);
});

// Test suite: Pure Expressions Return Empty Effects
test('literals have no effects', () => {
	const result = runCode('42');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure functions have no effects', () => {
	const result = runCode('fn x => x + 1');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure function application has no effects', () => {
	const result = runCode('sum = fn x y => x + y; sum 2 3');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure conditionals have no effects', () => {
	const result = runCode('if True then 1 else 2');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure lists have no effects', () => {
	const result = runCode('[1, 2, 3]');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure records have no effects', () => {
	const result = runCode('{ @name "Alice", @age 30 }');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure tuples have no effects', () => {
	const result = runCode('{1, 2, 3}');
	expect(result.typeResult.effects.size).toBe(0);
});

test('pure pattern matching has no effects', () => {
	const result = runCode(`
				variant Color = Red | Green | Blue;
				color = Red;
				match color with (Red => 1; Green => 2; Blue => 3)
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Type System Returns TypeResult with Effects
test('typeProgram returns TypeResult with variant and effects', () => {
	const result = runCode('42');
	expect(result.typeResult).toHaveProperty('type');
	expect(result.typeResult).toHaveProperty('effects');
	expect(result.typeResult).toHaveProperty('state');
	assertPrimitiveType(result.typeResult.type);
	expect(result.typeResult.type.kind).toBe('primitive');
	expect(result.typeResult.effects instanceof Set).toBeTruthy();
});

test('complex expressions return proper TypeResult structure', () => {
	const result = runCode(`
				sum = fn x y => x + y;
				mult = fn a b => a * b;
				compute = fn x => sum (mult x 2) 3;
				compute 5
			`);
	assertPrimitiveType(result.typeResult.type);
	expect(result.typeResult.type.name).toBe('Float');
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Effect Propagation in Sequences
test('sequences collect effects from all statements', () => {
	// Note: We don't have actual effectful built-ins yet, so this tests the infrastructure
	const result = runCode('x = 1; y = 2; x + y');
	expect(result.typeResult.effects.size).toBe(0); // All pure operations
});

test('sequences with pure operations have no effects', () => {
	const result = runCode(`
				a = 10;
				b = 20;
				c = 30;
				a + b + c
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Effect Propagation in Function Applications
test('function application with pure function and pure arguments has no effects', () => {
	const result = runCode(`
				sum = fn x y => x + y;
				sum (1 + 2) (3 * 4)
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('curried function application propagates effects correctly', () => {
	const result = runCode(`
				curry = fn f => fn x => fn y => f x y;
				sum = fn x y => x + y;
				curriedSum = curry sum;
				curriedSum 1 2
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Effect Propagation in Conditionals
test('conditional with pure branches has no effects', () => {
	const result = runCode(`
				condition = True;
				if condition then 1 + 2 else 3 * 4
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('nested conditionals with pure expressions have no effects', () => {
	const result = runCode(`
				x = 5;
				if x > 0 then (if x > 10 then 100 else 50) else 0
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Effect Propagation in Data Structures
test('lists with pure elements have no effects', () => {
	const result = runCode(`
				increment = fn x => x + 1;
				[increment 1, increment 2, increment 3]
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('records with pure field values have no effects', () => {
	const result = runCode(`
				compute = fn x => x * 2;
				{ @a compute 5, @b compute 10 }
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('tuples with pure elements have no effects', () => {
	const result = runCode(`
				double = fn x => x * 2;
				{double 1, double 2, double 3}
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Effect Propagation in Pipeline Operations
test('pipeline with pure functions has no effects', () => {
	const result = runCode(`
				double = fn x => x * 2;
				add5 = fn x => x + 5;
				compose = fn f => fn g => fn x => f (g x);
				pipeline = compose add5 double;
				pipeline 10
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('thrush operator with pure functions has no effects', () => {
	const result = runCode(`
				double = fn x => x * 2;
				10 | double
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Effect Propagation in Pattern Matching
test('pattern matching with pure cases has no effects', () => {
	const result = runCode(`
				opt = Some 42;
				match opt with (
					Some x => x * 2;
					None => 0
				)
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('nested pattern matching with pure expressions has no effects', () => {
	const result = runCode(`
				result = Ok (Some 42);
				match result with (
					Ok opt => match opt with (Some x => x; None => 0);
					Err e => -1
				)
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

// Test suite: Functions Inherit Effects from Body
test('function with pure body has no effects', () => {
	const result = runCode('fn x => x + 1');
	expect(result.typeResult.effects.size).toBe(0);
});

test('function with complex pure body has no effects', () => {
	const result = runCode(`
				fn x => if x > 0 then x * 2 else x + 1
			`);
	expect(result.typeResult.effects.size).toBe(0);
});

test('function with pure function calls in body has no effects', () => {
	const result = runCode(`
				helper = fn y => y * 3;
				fn x => helper (x + 1)
			`);
	expect(result.typeResult.effects.size).toBe(0);
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
	] as const;

	for (const { code, expectedKind } of expressions) {
		const result = runCode(code);
		expect(result).toHaveProperty('typeResult');
		expect(result.typeResult).toHaveProperty('type');
		expect(result.typeResult).toHaveProperty('effects');
		expect(result.typeResult).toHaveProperty('state');
		expect(result.typeResult.type.kind).toBe(expectedKind);
		expect(result.typeResult.effects instanceof Set).toBeTruthy();
	}
});

test('effects are properly typed as Set<Effect>', () => {
	const result = runCode('42');
	expect(result.typeResult.effects instanceof Set).toBeTruthy();
	// Verify we can use Set methods
	expect(typeof result.typeResult.effects.has).toBe('function');
	expect(typeof result.typeResult.effects.add).toBe('function');
	expect(result.typeResult.effects.size).toBe(0);
});

