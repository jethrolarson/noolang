import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

describe('Manual Constraint Resolution Testing', () => {
	const parseAndType = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const { typeProgram } = require('../index');
		return typeProgram(program);
	};

	test('should work with existing stdlib functor', () => {
		// Let's test if the existing Functor implementation works
		const code = `result = map (fn x => x + 1) [1, 2, 3]`;
		
		const result = parseAndType(code);
		console.log('Stdlib functor result:', JSON.stringify(result.type, null, 2));
		
		// This should work with the existing stdlib Functor implementation
		// Let's see what type we actually get
		expect(result.type).toBeDefined();
	});

	test('should show trait registry contents', () => {
		// Let's examine what's in the trait registry
		const code = `constraint TestShow a ( testShow: a -> String )`;
		
		const result = parseAndType(code);
		
		// Check what's in the trait registry
		const registry = result.state.traitRegistry;
		console.log('Trait definitions:', Array.from(registry.definitions.keys()));
		console.log('Trait implementations:', Object.fromEntries(
			Array.from(registry.implementations.entries()).map(([k, v]) => [k, Array.from(v.keys())])
		));
		
		// The test constraint should be registered
		expect(registry.definitions.has('TestShow')).toBe(true);
	});

	test('should examine list_map builtin function', () => {
		// Let's see if list_map (used in our implementation) works correctly
		const code = `result = list_map (fn x => x + 1) [1, 2, 3]`;
		
		const result = parseAndType(code);
		console.log('list_map result type:', JSON.stringify(result.type, null, 2));
		
		// list_map should work and return a list
		expect(result.type.kind).toBe('list');
		if (result.type.kind === 'list') {
			expect(result.type.elementType.kind).toBe('primitive');
			expect(result.type.elementType.name).toBe('Int');
		}
	});

	test('should work with direct trait implementation call', () => {
		// Test calling the trait implementation directly
		const code = `
			constraint DirectFunctor f ( directMap: (a -> b) -> f a -> f b );
			implement DirectFunctor List ( directMap = fn f list => list_map f list );
			result = directMap (fn x => x + 1) [1, 2, 3]
		`;
		
		const result = parseAndType(code);
		console.log('Direct trait implementation result:', JSON.stringify(result.type, null, 2));
		
		// When calling the trait implementation directly, what happens?
		expect(result.type).toBeDefined();
	});

	test('should understand the difference between list_map and trait dispatch', () => {
		// Compare list_map vs trait function
		const code1 = `result1 = list_map (fn x => x + 1) [1, 2, 3]`;
		const code2 = `result2 = map (fn x => x + 1) [1, 2, 3]`;
		
		const result1 = parseAndType(code1);
		const result2 = parseAndType(code2);
		
		console.log('list_map type:', JSON.stringify(result1.type, null, 2));
		console.log('trait map type:', JSON.stringify(result2.type, null, 2));
		
		// Both should produce similar results but might have different constraint tracking
		expect(result1.type).toBeDefined();
		expect(result2.type).toBeDefined();
	});
});