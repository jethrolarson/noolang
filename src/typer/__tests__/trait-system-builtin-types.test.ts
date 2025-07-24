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

	test('should support Functor implementation for List', () => {
		const code = `
			constraint Functor f ( map: (a -> b) -> f a -> f b );
			implement Functor List ( map = fn f list => list_map f list );
			result = map (fn x => x + 1) [1, 2, 3]
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('list');
	});

	test('should register List implementations correctly', () => {
		const code = `
			constraint Show a ( show: a -> String );
			implement Show List ( show = fn _ => "a list" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		expect(result.state.traitRegistry.definitions.has('Show')).toBe(true);
		
		const showImpls = result.state.traitRegistry.implementations.get('Show');
		expect(showImpls?.has('List')).toBe(true);
	});
});