import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';
import { describe, test, expect } from 'bun:test';

test('Trait System Phase 3: Constraint Resolution - Constraint Collapse - should handle constraint collapse for various concrete types', () => {
	const testCases = [
		{
			name: 'List with integers',
			code: 'map (fn x => x + 1) [1, 2, 3]',
			expectedKind: 'list',
			expectedType: 'List Float',
			shouldCollapse: true
		},
		{
			name: 'Option with integer',
			code: 'map (fn x => x + 1) (Some 42)',
			expectedKind: 'variant',
			expectedType: 'Option Float',
			shouldCollapse: true
		},
		{
			name: 'Nested map operations',
			code: 'map (fn x => x * 2) (map (fn x => x + 1) [1, 2, 3])',
			expectedKind: 'list',
			expectedType: 'List Float',
			shouldCollapse: true
		},
		{
			name: 'Partial application (no concrete type)',
			code: 'map (fn x => x + 1)',
			expectedKind: 'constrained',
			expectedType: /implements Functor/,
			shouldCollapse: false
		},
		{
			name: 'Pure function (preserves constraint)',
			code: 'pure 1',
			expectedKind: 'constrained',
			expectedType: /implements Monad/,
			shouldCollapse: false
		}
	];

	for (const testCase of testCases) {
		const lexer = new Lexer(testCase.code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const typeResult = typeProgram(program);
		const typeString = typeToString(typeResult.type);
		
		// Check type kind
		expect(typeResult.type.kind).toBe(testCase.expectedKind);
		
		// Check type string
		if (typeof testCase.expectedType === 'string') {
			expect(typeString).toBe(testCase.expectedType);
		} else {
			assert.match(typeString, testCase.expectedType);
		}
		
		// Check constraint collapse behavior
		if (testCase.shouldCollapse) {
			assert.not.match(typeString, /implements|given|α\d+/);
		} else {
			assert.match(typeString, /implements|given|α\d+/);
		}
	}
});

test('Trait System Phase 3: Constraint Resolution - Complex Constraint Resolution - should handle multiple different constraints with partial collapse', () => {
	const code = `
		showAndIncrement = fn x => show (x + 1);
		result = map showAndIncrement [1, 2, 3]
	`;
	
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const typeResult = typeProgram(program);
	
	// PARTIAL CONSTRAINT COLLAPSE: Functor constraint gets resolved to List,
	// but Show constraint from within the mapped function is preserved
	expect(typeResult.type.kind).toBe('list');
	const typeString = typeToString(typeResult.type);
	assert.match(typeString, /List String/);
	assert.match(typeString, /implements Show/); // Show constraint preserved for now
});

test('Trait System Phase 3: Constraint Resolution - Advanced Edge Cases - should handle polymorphic functions with constraints', () => {
	const code = `
		polymorphicMap = fn f list => map f list;
		result = polymorphicMap (fn x => x + 1) [1, 2, 3]
	`;
	
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const typeResult = typeProgram(program);
	
	// Should propagate constraints through polymorphic functions
	expect(typeResult.type.kind).toBe('constrained');
});

