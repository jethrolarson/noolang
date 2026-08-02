import { formatValue, formatValueWithType } from '../format';
import type { Value } from '../evaluator/evaluator';
import { floatType } from '../ast';
import { test, expect } from 'bun:test';

const three: Value = { tag: 'number', value: 3 };

test('formatValueWithType - appends the type string when a type is given', () => {
	const result = formatValueWithType(
		three,
		floatType(),
		(_t, _sub) => 'Float',
		new Map()
	);
	expect(result).toBe('3 : Float');
});

test('formatValueWithType - falls back to just the value when type is undefined', () => {
	const result = formatValueWithType(three, undefined, (_t, _sub) => 'Float', new Map());
	expect(result).toBe(formatValue(three));
});

// A nested constructor argument with its own args needs parens, or the
// printed form is ambiguous about nesting depth: `Cons 2 Cons 3 Cons 4 Nil`
// reads as one flat application, not `Cons 2 (Cons 3 (Cons 4 Nil))`.
test('formatValue - wraps a nested multi-arg constructor argument in parens', () => {
	const nil: Value = { tag: 'constructor', name: 'Nil', args: [] };
	const cons4: Value = {
		tag: 'constructor',
		name: 'Cons',
		args: [{ tag: 'number', value: 4 }, nil],
	};
	const cons3: Value = {
		tag: 'constructor',
		name: 'Cons',
		args: [{ tag: 'number', value: 3 }, cons4],
	};
	const cons2: Value = {
		tag: 'constructor',
		name: 'Cons',
		args: [{ tag: 'number', value: 2 }, cons3],
	};
	expect(formatValue(cons2)).toBe('Cons 2 (Cons 3 (Cons 4 Nil))');
});

test('formatValue - a zero-arg constructor argument still prints bare (no parens needed)', () => {
	const nil: Value = { tag: 'constructor', name: 'Nil', args: [] };
	const some: Value = { tag: 'constructor', name: 'Some', args: [nil] };
	expect(formatValue(some)).toBe('Some Nil');
});
