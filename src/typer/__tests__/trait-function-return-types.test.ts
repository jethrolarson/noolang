import { test, expect } from 'bun:test';
import {
	assertFunctionType,
	assertListType,
	assertPrimitiveType,
	assertVariantType,
	parseAndType,
	assertConstrainedType,
	assertImplementsTraitConstraint,
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

test.skip('equality in lambda functions resolves correctly', () => {
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

test.skip('should infer Eq constraint for equality operator usage', () => {
	const code = 'fn x => x == 42';
	const typeResult = parseAndType(code);

	// Should create a constrained type with Eq constraint
	assertConstrainedType(typeResult.type);
	assertImplementsTraitConstraint(typeResult.type.constraints.get('Eq')![0]);

	// Check that the constraint is for Eq trait
	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	expect(constraintEntries.length).toBeGreaterThan(0);

	const constraint = constraintEntries[0][1][0];
	assertImplementsTraitConstraint(constraint);
	expect(constraint.trait).toBe('Eq');
});

test.skip('should infer Add constraint for addition operator usage', () => {
	const code = 'fn x => x + 10';
	const typeResult = parseAndType(code);

	expect(typeResult.type.kind).toBe('constrained');
	assertConstrainedType(typeResult.type);

	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	expect(constraintEntries.length).toBeGreaterThan(0);

	const constraint = constraintEntries[0][1][0];
	assertImplementsTraitConstraint(constraint);
	expect(constraint.trait).toBe('Add');
});

test('should not infer constraints when no operators are used', () => {
	const code = 'fn x => x';
	const typeResult = parseAndType(code);

	// Should be a simple function type, not constrained
	expect(typeResult.type.kind).toBe('function');
	assertFunctionType(typeResult.type);
});

test.skip('should infer constraints in if expressions', () => {
	const code = 'fn x => if x == 0 then 1 else x + 1';
	const typeResult = parseAndType(code);

	expect(typeResult.type.kind).toBe('constrained');
	assertConstrainedType(typeResult.type);

	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	expect(constraintEntries.length).toBeGreaterThan(0);

	const constraints = constraintEntries[0][1];
	const traitNames = constraints.map(c => {
		assertImplementsTraitConstraint(c);
		return c.trait;
	});
	expect(traitNames).toContain('Eq');
	expect(traitNames).toContain('Add');
});

test.skip('should infer constraints in where expressions', () => {
	const code = `
			fn x => where (
				y = x + 1;
				result = y == 42
			) result
		`;
	const typeResult = parseAndType(code);

	expect(typeResult.type.kind).toBe('constrained');
	assertConstrainedType(typeResult.type);

	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	expect(constraintEntries.length).toBeGreaterThan(0);

	const constraints = constraintEntries[0][1];
	const traitNames = constraints.map(c => {
		assertImplementsTraitConstraint(c);
		return c.trait;
	});
	expect(traitNames).toContain('Add');
	expect(traitNames).toContain('Eq');
});

test.skip('should infer constraints for arithmetic operators', () => {
	const code = 'fn x => x - 5 * 2 / 3';
	const typeResult = parseAndType(code);

	expect(typeResult.type.kind).toBe('constrained');
	assertConstrainedType(typeResult.type);

	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	expect(constraintEntries.length).toBeGreaterThan(0);

	const constraints = constraintEntries[0][1];
	const traitNames = constraints.map(c => {
		assertImplementsTraitConstraint(c);
		return c.trait;
	});
	expect(traitNames).toContain('Sub');
	expect(traitNames).toContain('Mul');
	expect(traitNames).toContain('Div');
});

test.skip('should work with concrete types that implement traits', () => {
	const code = 'fn x => x + 1';
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

test.skip('should handle complex nested expressions', () => {
	const code = `
		fn x => where (
			temp = x + 10;
			check = temp == 50;
			result = if check then x * 2 else x - 5
		) result
	`;
	const typeResult = parseAndType(code);

	expect(typeResult.type.kind).toBe('constrained');
	assertConstrainedType(typeResult.type);

	const constraintEntries = Array.from(typeResult.type.constraints.entries());
	expect(constraintEntries.length).toBeGreaterThan(0);

	const constraints = constraintEntries[0][1];
	const traitNames = constraints.map(c => {
		assertImplementsTraitConstraint(c);
		return c.trait;
	});
	expect(traitNames).toContain('Add');
	expect(traitNames).toContain('Eq');
	expect(traitNames).toContain('Mul');
	expect(traitNames).toContain('Sub');
});


