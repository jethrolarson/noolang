import { test, expect } from 'bun:test';
import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

test('Type Display - Trait constraints', () => {
	const result = parseAndType('fn x y => x + y');
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('a -> a -> a given a implements Add');
});

test('Type Display - Structural constraints', () => {
	const result = parseAndType('fn obj => @name obj');
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('a -> b given a has {@name b}');
});

test('Type Display - Complex constraints with Functor and structural', () => {
	const result = parseAndType('map @name');
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe(
		'a b -> a c given b has {@name c} and a implements Functor'
	);
});

test('Type Display - Variable name consistency', () => {
	const result = parseAndType('map @name');
	const typeStr = typeToString(result.type, result.state.substitution);

	// Parse the type string to check variable consistency
	expect(typeStr).toBe(
		'a b -> a c given b has {@name c} and a implements Functor'
	);
});

test('Type Display - Simple types without constraints', () => {
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

test('Type Display - Variant type variable normalization', () => {
	// Test that variant type variables are consistently normalized
	const result = parseAndType('map id');
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('a b -> a b given a implements Functor');
});
