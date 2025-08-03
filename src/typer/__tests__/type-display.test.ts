import { test, expect, describe } from 'bun:test';
import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

describe('Type Display', () => {
	test('add partially applied', () => {
		const result = parseAndType('add 1');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Float -> Float');
	});

	test('add fully applied', () => {
		const result = parseAndType('add 1 2');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('Float');
	});

	test('map trait type', () => {
		const result = parseAndType('map');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('(a -> b) -> c a -> c b given c implements Functor');
	});

	test('map partially applied', () => {
		const result = parseAndType('map (add 1)');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('f Float -> f Float given f implements Functor');
	});

	test('map fully applied', () => {
		const result = parseAndType('map (add 1) [1, 2]');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('List Float');
	});

	test('Trait constraints propagate', () => {
		const result = parseAndType('fn x y => x + y');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('a -> a -> a given a implements Add');
	});

	test('Structural constraints propagate', () => {
		const result = parseAndType('fn obj => @name obj');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('a -> b given a has {@name b}');
	});

	test('Complex constraints with Functor and structural', () => {
		const result = parseAndType('map @name');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe(
			'f a -> f b given a has {@name b} and f implements Functor'
		);
	});

	test('Variable name consistency', () => {
		const result = parseAndType('map @name');
		const typeStr = typeToString(result.type, result.state.substitution);

		// Parse the type string to check variable consistency
		expect(typeStr).toBe(
			'f a -> f b given a has {@name b} and f implements Functor'
		);
	});

	test('Simple types without constraints', () => {
		// Test that simple types work correctly
		const simpleResult = parseAndType('42');
		const simpleStr = typeToString(
			simpleResult.type,
			simpleResult.state.substitution
		);
		expect(simpleStr).toBe('Float');

		const identityResult = parseAndType('fn x => x');
		const identityStr = typeToString(
			identityResult.type,
			identityResult.state.substitution
		);
		expect(identityStr).toBe('a -> a');
	});

	test('Variant type variable normalization', () => {
		// Test that variant type variables are consistently normalized
		const result = parseAndType('map id');
		const typeStr = typeToString(result.type, result.state.substitution);
		expect(typeStr).toBe('f a -> f a given f implements Functor');
	});
});
