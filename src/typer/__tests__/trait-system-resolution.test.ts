import { typeToString } from '../helpers';
import { test, expect } from 'bun:test';
import {
	assertListType,
	assertPrimitiveType,
	parseAndType,
} from '../../../test/utils';

test('Trait System Phase 3: Constraint Resolution - Constraint Collapse - should handle constraint collapse for various concrete types', () => {
	const testCases = [
		{
			name: 'List with integers',
			code: 'map (fn x => x + 1) [1, 2, 3]',
			expectedKind: 'list',
			expectedType: 'List Float',
			shouldCollapse: true,
		},
		{
			name: 'Option with integer',
			code: 'map (fn x => x + 1) (Some 42)',
			expectedKind: 'variant',
			expectedType: 'Option Float',
			shouldCollapse: true,
		},
		{
			name: 'Nested map operations',
			code: 'map (fn x => x * 2) (map (fn x => x + 1) [1, 2, 3])',
			expectedKind: 'list',
			expectedType: 'List Float',
			shouldCollapse: true,
		},
		{
			name: 'Partial application (no concrete type)',
			code: 'map (fn x => x + 1)',
			expectedKind: 'constrained',
			expectedType: /implements Functor/,
			shouldCollapse: false,
		},
		{
			name: 'Pure function (preserves constraint)',
			code: 'pure 1',
			expectedKind: 'constrained',
			expectedType: /implements Monad/,
			shouldCollapse: false,
		},
	] as const;

	for (const testCase of testCases) {
		const typeResult = parseAndType(testCase.code);
		const typeString = typeToString(typeResult.type);

		// Check type kind
		expect(typeResult.type.kind).toBe(testCase.expectedKind);

		// Check type string
		if (typeof testCase.expectedType === 'string') {
			expect(typeString).toBe(testCase.expectedType);
		} else {
			expect(typeString).toMatch(testCase.expectedType);
		}

		// Check constraint collapse behavior
		if (testCase.shouldCollapse) {
			expect(typeString).not.toMatch(/implements|given|α\d+/);
		} else {
			expect(typeString).toMatch(/implements|given|α\d+/);
		}
	}
});

test('Trait System Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle multiple different constraints with partial collapse', () => {
	const code = `
		showAndIncrement = fn x => show (x + 1);
		result = map showAndIncrement [1, 2, 3]
	`;

	const typeResult = parseAndType(code);

	assertListType(typeResult.type);
	assertPrimitiveType(typeResult.type.element);
	expect(typeResult.type.element.name).toBe('Float');
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
