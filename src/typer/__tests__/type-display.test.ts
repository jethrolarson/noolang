import { test, expect } from 'bun:test';
import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

test('Type Display - Constraint display functionality', () => {
	// Test trait constraints
	const traitResult = parseAndType('fn x y => x + y');
	const traitStr = typeToString(
		traitResult.type,
		traitResult.state.substitution
	);
	expect(traitStr).toMatch(
		/^[α-ω] -> [α-ω] -> [α-ω] given [α-ω] implements Add$/
	);

	// Test structural constraints
	const structResult = parseAndType('fn obj => @name obj');
	const structStr = typeToString(
		structResult.type,
		structResult.state.substitution
	);
	expect(structStr).toContain('given');
	expect(structStr).toContain('has');
	expect(structStr).toContain('@name');

	// Test complex constraints (functor + structural)
	const complexResult = parseAndType('map @name');
	const complexStr = typeToString(
		complexResult.type,
		complexResult.state.substitution
	);
	expect(complexStr).toContain('implements Functor');
	expect(complexStr).toContain('has {@name');
	expect(complexStr).toContain('and');

	// Test no duplicate constraints
	expect(complexStr).not.toMatch(/given.*given/); // Should not have "given" twice
	expect(traitStr).not.toMatch(/Add.*Add/); // Should not have duplicate "Add"
});

test('Type Display - Variable name consistency', () => {
	const result = parseAndType('map @name');
	const typeStr = typeToString(result.type, result.state.substitution);

	// Parse the type string to check variable consistency
	// Expected format: "α β -> α γ given β has {@name γ} and α implements Functor"
	const match = typeStr.match(
		/^([α-ω]+) ([α-ω]+) -> \1 ([α-ω]+) given \2 has \{@name \3\} and \1 implements Functor$/
	);
	expect(match).toBeTruthy();

	if (match) {
		const [, functorVar, elementVar, fieldVar] = match;
		// All three variables should be different
		expect(functorVar).not.toBe(elementVar);
		expect(functorVar).not.toBe(fieldVar);
		expect(elementVar).not.toBe(fieldVar);
	}
});

test('Type Display - Constraint ordering', () => {
	const result = parseAndType('map @name');
	const typeStr = typeToString(result.type, result.state.substitution);

	// Current behavior: has comes before implements
	const implementsIndex = typeStr.indexOf('implements');
	const hasIndex = typeStr.indexOf('has');
	expect(hasIndex).toBeLessThan(implementsIndex);
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
	expect(identityStr).toMatch(/^[α-ω] -> [α-ω]$/);
	expect(identityStr).not.toContain('given'); // Should not have constraints
});

test('Type Display - Variant type variable normalization', () => {
	// Test that variant type variables are consistently normalized
	const result = parseAndType('map id');
	const typeStr = typeToString(result.type, result.state.substitution);

	// Expected format: "α β -> α β given α implements Functor"
	const match = typeStr.match(
		/^([α-ω]+) ([α-ω]+) -> \1 \2 given \1 implements Functor$/
	);
	expect(match).toBeTruthy();
	expect(typeStr).toContain('implements Functor');
});
