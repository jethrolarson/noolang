import { typeToString } from '../helpers';
import { test, expect } from 'bun:test';
import {
	assertListType,
	assertPrimitiveType,
	parseAndType,
} from '../../../test/utils';

test('Constraint Collapse - List with integers should collapse to concrete type', () => {
	const typeResult = parseAndType('map (fn x => x + 1) [1, 2, 3]');
	const typeString = typeToString(typeResult.type);

	expect(typeResult.type.kind).toBe('list');
	expect(typeString).toBe('List Float');
});

test('Constraint Collapse - partially applied trait function should collapse to concrete type', () => {
	const typeResult = parseAndType('map (add 1) [1, 2, 3]');
	const typeString = typeToString(typeResult.type);

	expect(typeResult.type.kind).toBe('list');
	expect(typeString).toBe('List Float');
});

test('Constraint Collapse - Option with integer should collapse to concrete type', () => {
	const typeResult = parseAndType('map (fn x => x + 1) (Some 42)');
	const typeString = typeToString(typeResult.type);

	expect(typeResult.type.kind).toBe('variant');
	expect(typeString).toBe('Option Float');
});

test('Constraint Collapse - Nested map operations should collapse to concrete type', () => {
	const typeResult = parseAndType('map show (map (fn x => x + 1) [1, 2, 3])');
	const typeString = typeToString(typeResult.type);

	expect(typeResult.type.kind).toBe('list');
	expect(typeString).toBe('List String');
});

test('Constraint Collapse - Partial application should preserve constraints', () => {
	const typeResult = parseAndType('map (fn x => x + 1)');
	const typeString = typeToString(typeResult.type);

	expect(typeResult.type.kind).toBe('function');
	expect(typeString).toBe('a Float -> a Float given a implements Functor');
});

test('Constraint Collapse - Pure function should preserve constraints', () => {
	const typeResult = parseAndType('pure 1');
	const typeString = typeToString(typeResult.type);

	expect(typeResult.type.kind).toBe('variant');
	expect(typeString).toBe('a Float given a implements Monad');
});

test('Trait System Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle multiple different constraints with partial collapse', () => {
	const code = `
		showAndIncrement = fn x => show (x + 1);
		result = map showAndIncrement [1, 2, 3]
	`;

	const typeResult = parseAndType(code);

	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('String');
});

test.skip('Trait System Phase 3: Constraint Resolution - Advanced Edge Cases - should handle polymorphic functions with constraints', () => {
	const code = `
		polymorphicMap = fn f list => map f list;
		result = polymorphicMap (fn x => x + 1) [1, 2, 3]
	`;

	const typeResult = parseAndType(code);
	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('Float');
});
