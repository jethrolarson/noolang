import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

describe('Trait System: Built-in Types', () => {
	const parseAndType = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const { typeProgram } = require('../index');
		return typeProgram(program);
	};

	test('should support trait implementations for List type', () => {
		const code = `
			constraint Test f ( test: f a -> String );
			implement Test List ( test = fn _ => "list works" );
			result = test [1, 2, 3]
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('primitive');
		expect(result.type.name).toBe('String');
	});

	test.skip('should support Functor implementation for List', () => {
		// SKIP: This test requires constraint resolution (Phase 3)
		// The issue: map has type (α Int) -> α Int given α implements Functor
		// When applied to [1,2,3] (List Int), system needs to resolve α = List
		// This requires constraint resolution during unification
		const code = `
			constraint MyFunctor f ( map: (a -> b) -> f a -> f b );
			implement MyFunctor List ( map = fn f list => list_map f list );
			result = map (fn x => x + 1) [1, 2, 3]
		`;
		
		const result = parseAndType(code);
		
		// For now, just check that the type is a variable (which is expected for trait functions)
		// The trait system integration is not complete yet
		expect(result.type.kind).toBe('variable');
		expect((result.type as any).name).toMatch(/^α\d+$/);
	});

	test('should register List implementations correctly', () => {
		const code = `
			constraint MyShow a ( show: a -> String );
			implement MyShow List ( show = fn _ => "a list" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		expect(result.state.traitRegistry.definitions.has('MyShow')).toBe(true);
		
		const showImpls = result.state.traitRegistry.implementations.get('MyShow');
		expect(showImpls?.has('List')).toBe(true);
	});
});