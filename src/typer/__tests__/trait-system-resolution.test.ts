import { typeToString } from '../helpers';
import { test, expect, describe } from 'bun:test';
import {
	assertListType,
	assertPrimitiveType,
	parseAndType,
} from '../../../test/utils';

const parseToString = (code: string) => {
	const typeResult = parseAndType(code);
	return typeToString(typeResult.type, typeResult.state.substitution);
};

describe('Constraint Collapse', () => {
	test('map type is correct', () => {
		const typeString = parseToString('map');

		expect(typeString).toBe(
			'(a -> b) -> c a -> c b given c implements Functor'
		);
	});
	test('map should work with unary trait functions', () => {
		const typeString = parseToString('map show [1, 2, 3]');

		expect(typeString).toBe('List String');
	});
	test('List with integers should collapse to concrete type', () => {
		const typeString = parseToString('map (fn x => x + 1) [1, 2, 3]');

		expect(typeString).toBe('List Float');
	});

	test('partially applied trait function should collapse to concrete type', () => {
		const typeString = parseToString('map (add 1) [1, 2, 3]');

		expect(typeString).toBe('List Float');
	});

	test('Option with integer should collapse to concrete type', () => {
		const typeString = parseToString('map (fn x => x + 1) (Some 42)');

		expect(typeString).toBe('Option Float');
	});

	test('Nested map operations should collapse to concrete type', () => {
		const typeString = parseToString('map show (map (add 1) [1])');

		expect(typeString).toBe('List String');
	});

	test('operators erase constraints that are resolved', () => {
		const typeString = parseToString('(fn x => x + 1)');

		expect(typeString).toBe('Float -> Float');
	});

	test('trait functions erase constraints that are resolved', () => {
		const typeString = parseToString('(fn x => add x 1)');

		expect(typeString).toBe('Float -> Float');
	});

	test('Partial application should preserve constraints', () => {
		const typeString = parseToString('map (fn x => x + 1)');

		expect(typeString).toBe('f Float -> f Float given f implements Functor');
	});

	test('Pure function should preserve constraints', () => {
		const typeString = parseToString('pure 1');

		expect(typeString).toBe('m Float given m implements Monad');
	});
});

describe('Complex Constraint Resolution', () => {
	test('should handle multiple different constraints with partial collapse', () => {
		const code = `
		showAndIncrement = fn x => show (x + 1);
		result = map showAndIncrement [1, 2, 3]
	`;

		const typeResult = parseAndType(code);

		assertListType(typeResult.type);
		assertPrimitiveType(typeResult.type.element);
		expect(typeResult.type.element.name).toBe('String');
	});

	test('Trait System Phase 3: Constraint Resolution - Advanced Edge Cases - should handle polymorphic functions with constraints', () => {
		const code = `
		polymorphicMap = fn f list => map f list;
		result = polymorphicMap (fn x => x + 1) [1, 2, 3]
	`;

		const typeResult = parseAndType(code);
		assertListType(typeResult.type);
		assertPrimitiveType(typeResult.type.element);
		expect(typeResult.type.element.name).toBe('Float');
	});
});