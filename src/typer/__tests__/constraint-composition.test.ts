import { test, expect } from 'bun:test';
import {
	composeStructuralConstraints,
	extractResultTypeVar,
	isSimpleFieldConstraint,
} from '../constraint-composition';
import type { HasStructureConstraint } from '../../ast';
import {
	assertNestedStructureFieldType,
	assertStructureFieldType,
	assertVariableType,
} from '../../../test/utils';

// Helper to create constraint
function hasConstraint(
	typeVar: string,
	fieldName: string,
	fieldTypeVar: string
): HasStructureConstraint {
	return {
		kind: 'has',
		typeVar,
		structure: {
			fields: {
				[fieldName]: { kind: 'variable', name: fieldTypeVar },
			},
		},
	};
}

test('composeStructuralConstraints - basic composition', () => {
	// person has {address: α}
	const inner = hasConstraint('person', 'address', 'α1');

	// address has {street: β}
	const outer = hasConstraint('dummy', 'street', 'α2');

	// Should produce: person has {address: {street: β}}
	const result = composeStructuralConstraints(inner, outer, 'α1');

	expect(result.kind).toBe('has');
	expect(result.typeVar).toBe('person');
	expect(result.structure.fields).toHaveProperty('address');

	const addressField = result.structure.fields.address;
	assertNestedStructureFieldType(addressField);
	expect(addressField.structure.fields).toHaveProperty('street');
	const streetField = addressField.structure.fields.street;
	assertStructureFieldType(streetField);
	assertVariableType(streetField);
	expect(streetField.name).toBe('α2');
});

test('composeStructuralConstraints - connection variable not found', () => {
	const inner = hasConstraint('person', 'address', 'α1');
	const outer = hasConstraint('dummy', 'street', 'α2');

	// Wrong connection variable
	expect(() => {
		composeStructuralConstraints(inner, outer, 'a3');
	}).toThrow(
		'Cannot compose constraints: connection variable a3 not found in inner constraint'
	);
});

test('composeStructuralConstraints - multiple fields in inner', () => {
	// person has {address: α, name: γ}
	const inner: HasStructureConstraint = {
		kind: 'has',
		typeVar: 'person',
		structure: {
			fields: {
				address: { kind: 'variable', name: 'α1' },
				name: { kind: 'variable', name: 'α3' },
			},
		},
	};

	const outer = hasConstraint('dummy', 'street', 'α2');

	// Should produce: person has {address: {street: β}, name: γ}
	const result = composeStructuralConstraints(inner, outer, 'α1');

	expect(result.typeVar).toBe('person');
	expect(Object.keys(result.structure.fields)).toHaveLength(2);
	expect(result.structure.fields).toHaveProperty('address');
	expect(result.structure.fields).toHaveProperty('name');

	// Address field should be nested
	const addressField = result.structure.fields.address;
	expect(addressField.kind).toBe('nested');

	// Name field should be unchanged
	const nameField = result.structure.fields.name;
	assertStructureFieldType(nameField);
	assertVariableType(nameField);
	expect(nameField.name).toBe('α3');
});

test('extractResultTypeVar - simple constraint', () => {
	const constraint = hasConstraint('person', 'street', 'α1');
	const result = extractResultTypeVar(constraint);
	expect(result).toBe('α1');
});

test('extractResultTypeVar - nested constraint', () => {
	// Create: person has {address: {street: α123}}
	const constraint: HasStructureConstraint = {
		kind: 'has',
		typeVar: 'person',
		structure: {
			fields: {
				address: {
					kind: 'nested',
					structure: {
						fields: {
							street: { kind: 'variable', name: 'α1' },
						},
					},
				},
			},
		},
	};

	const result = extractResultTypeVar(constraint);
	expect(result).toBe('α1');
});

test('extractResultTypeVar - multi-field constraint', () => {
	const constraint: HasStructureConstraint = {
		kind: 'has',
		typeVar: 'person',
		structure: {
			fields: {
				street: { kind: 'variable', name: 'α1' },
				city: { kind: 'variable', name: 'α2' },
			},
		},
	};

	const result = extractResultTypeVar(constraint);
	expect(result).toBe(null); // Multi-field not supported
});

test('isSimpleFieldConstraint - single field', () => {
	const constraint = hasConstraint('person', 'street', 'α1');
	expect(isSimpleFieldConstraint(constraint)).toBe(true);
});

test('isSimpleFieldConstraint - multiple fields', () => {
	const constraint: HasStructureConstraint = {
		kind: 'has',
		typeVar: 'person',
		structure: {
			fields: {
				street: { kind: 'variable', name: 'α1' },
				city: { kind: 'variable', name: 'α2' },
			},
		},
	};

	expect(isSimpleFieldConstraint(constraint)).toBe(false);
});

test('constraint composition integration example', () => {
	// Simulate: getStreet(getAddress(person))
	// Step 1: person has {address: α127} (from getAddress)
	// Step 2: address has {street: β456} (from getStreet)
	// Result: person has {address: {street: β456}}

	const addressConstraint = hasConstraint('person', 'address', 'α1');
	const streetConstraint = hasConstraint('α1', 'street', 'α2');

	const composed = composeStructuralConstraints(
		addressConstraint,
		streetConstraint,
		'α1'
	);

	// Verify structure
	expect(composed.typeVar).toBe('person');
	expect(composed.structure.fields.address.kind).toBe('nested');

	// Extract final result type
	const resultVar = extractResultTypeVar(composed);
	expect(resultVar).toBe('α2');
});
