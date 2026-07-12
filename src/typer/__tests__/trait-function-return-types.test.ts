import { test, expect } from 'bun:test';
import {
	assertFunctionType,
	assertListType,
	assertPrimitiveType,
	assertVariantType,
	parseAndType,
	assertImplementsConstraint,
} from '../../../test/utils';

test('built-in equality operator returns Bool type', () => {
	const input = '1.0 == 2.0';
	const result = parseAndType(input);

	assertVariantType(result.type);
	expect(result.type.name).toEqual('Bool');
});

test('string equality returns Bool type', () => {
	const input = '"hello" == "world"';
	const result = parseAndType(input);

	assertVariantType(result.type);
	expect(result.type.name).toEqual('Bool');
});

test('equality in lambda functions resolves correctly', () => {
	const input = 'fn x => x == 1.0';
	const result = parseAndType(input);

	assertFunctionType(result.type);
	expect(result.type.params.length).toEqual(1);
	assertPrimitiveType(result.type.params[0]);
	expect(result.type.params[0].name).toEqual('Float');
	assertVariantType(result.type.return);
	expect(result.type.return.name).toEqual('Bool');
});

test('map with basic function works correctly', () => {
	const input = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
	const result = parseAndType(input);

	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toEqual('Float');
});

test('nested arithmetic expressions type correctly', () => {
	const input = '(1.0 + 2.0) * (3.0 - 4.0)';
	const result = parseAndType(input);

	assertPrimitiveType(result.type);
	expect(result.type.name).toEqual('Float');
});

test('variables and boolean operations complete without exponential unification', () => {
	const program = `
        a = 1.0 == 1.0;
        b = 2.0 == 2.0;
        c = 3.0 == 3.0;
        result = [a, b, c];
        result
    `;

	const result = parseAndType(program);

	assertListType(result.type);
	assertVariantType(result.type.element);
	expect(result.type.element.name).toEqual('Bool');
});

test('should not infer constraints when no operators are used', () => {
	const code = 'fn x => x';
	const typeResult = parseAndType(code);

	// Should be a simple function type, not constrained
	expect(typeResult.type.kind).toBe('function');
	assertFunctionType(typeResult.type);
});

test('should infer constraints in if expressions', () => {
	const code = 'fn x => if x == 0 then 1 else x + 1';
	const typeResult = parseAndType(code);

	expect(typeResult.type).toEqual(
		expect.objectContaining({
			kind: 'function',
			params: [
				{
					kind: 'primitive',
					name: 'Float',
				},
			],
			return: {
				kind: 'primitive',
				name: 'Float',
			},
		})
	);
});

// `x + 1` pins x to Float (numeric literals are all Float now, Int was
// removed), so `Float -> Bool` is correct here, not a constrained type -
// see docs-wip/GENERALIZATION_BUG.md.
test('where-bound result concretely typed when literals pin the type', () => {
	const code = `
			fn x => result where (
				y = x + 1;
				result = y == 42
			)
		`;
	const typeResult = parseAndType(code);

	assertFunctionType(typeResult.type);
	assertPrimitiveType(typeResult.type.params[0]);
	expect(typeResult.type.params[0].name).toBe('Float');
	assertVariantType(typeResult.type.return);
	expect(typeResult.type.return.name).toBe('Bool');
});

// Regression for the generalize/freeTypeVarsEnv bug (GENERALIZATION_BUG.md):
// a where-bound (or semicolon-let-bound) result must stay linked to the
// enclosing function's parameters, not get quantified as an unrelated var
// with its constraint dropped.
test('where-bound result stays linked to params and keeps its constraint', () => {
	const code = 'fn x y => result where (result = x + y)';
	const typeResult = parseAndType(code);

	assertFunctionType(typeResult.type);
	expect(typeResult.type.constraints?.length).toBeGreaterThan(0);
	assertImplementsConstraint(typeResult.type.constraints![0]);
	expect(typeResult.type.constraints![0].interfaceName).toBe('Add');
});

test('semicolon-let-bound result stays linked to params and keeps its constraint', () => {
	const code = 'fn x y => (result = x + y; result)';
	const typeResult = parseAndType(code);

	assertFunctionType(typeResult.type);
	expect(typeResult.type.constraints?.length).toBeGreaterThan(0);
	assertImplementsConstraint(typeResult.type.constraints![0]);
	expect(typeResult.type.constraints![0].interfaceName).toBe('Add');
});

test('should work with concrete types that implement traits', () => {
	const code = 'addOne =fn x => x + 1';
	const _typeResult = parseAndType(code);

	// Apply the function to a concrete type that implements Add
	const appliedCode = `
		${code};
		result = addOne 42
	`;
	const appliedResult = parseAndType(appliedCode);

	// Should resolve to concrete type
	expect(appliedResult.type.kind).toBe('primitive');
	assertPrimitiveType(appliedResult.type);
	expect(appliedResult.type.name).toBe('Float');
});

