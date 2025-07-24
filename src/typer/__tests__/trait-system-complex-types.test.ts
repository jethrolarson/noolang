import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

describe('Trait System: Complex Type Support', () => {
	const parseAndType = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const { typeProgram } = require('../index');
		return typeProgram(program);
	};

	test('should support parameterized types with concrete arguments', () => {
		const code = `
			constraint Show a ( show: a -> String );
			implement Show (List Int) ( show = fn _ => "list of ints" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		expect(result.state.traitRegistry.definitions.has('Show')).toBe(true);
		
		const showImpls = result.state.traitRegistry.implementations.get('Show');
		expect(showImpls?.has('List')).toBe(true);
	});

	test('should support function types in implementations', () => {
		const code = `
			constraint Show a ( show: a -> String );
			implement Show (a -> b) ( show = fn _ => "<function>" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		expect(result.state.traitRegistry.definitions.has('Show')).toBe(true);
		
		const showImpls = result.state.traitRegistry.implementations.get('Show');
		expect(showImpls?.has('function')).toBe(true);
	});

	test('should support nested parameterized types', () => {
		const code = `
			constraint MyShow a ( show: a -> String );
			implement MyShow (Option (List String)) ( show = fn _ => "option of list of strings" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		expect(result.state.traitRegistry.definitions.has('MyShow')).toBe(true);
		
		const showImpls = result.state.traitRegistry.implementations.get('MyShow');
		expect(showImpls?.has('Option')).toBe(true);
	});

	test('should support multiple concrete type parameters', () => {
		const code = `
			constraint MyFunctor f ( map: (a -> b) -> f a -> f b );
			implement MyFunctor (Result String) ( map = fn f result => result )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		expect(result.state.traitRegistry.definitions.has('MyFunctor')).toBe(true);
		
		const functorImpls = result.state.traitRegistry.implementations.get('MyFunctor');
		expect(functorImpls?.has('Result')).toBe(true);
	});

	test('should support complex function types with multiple parameters', () => {
		const code = `
			constraint Show a ( show: a -> String );
			implement Show (Int -> String -> Bool) ( show = fn _ => "<function3>" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		const showImpls = result.state.traitRegistry.implementations.get('Show');
		expect(showImpls?.has('function')).toBe(true);
	});

	test('should support all primitive types', () => {
		const code = `
			constraint MyShow a ( show: a -> String );
			implement MyShow String ( show = fn s => "string" );
			implement MyShow Int ( show = toString );
			implement MyShow Unit ( show = fn _ => "unit" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		const showImpls = result.state.traitRegistry.implementations.get('MyShow');
		
		expect(showImpls?.has('String')).toBe(true);
		expect(showImpls?.has('Int')).toBe(true);
		expect(showImpls?.has('unit')).toBe(true); // Unit type maps to 'unit' name
	});

	test('should error for duplicate implementations of same type', () => {
		const code = `
			constraint Show a ( show: a -> String );
			implement Show Int ( show = toString );
			implement Show Int ( show = fn x => "duplicate" )
		`;
		
		// This should error because we're implementing Show for Int twice
		expect(() => parseAndType(code)).toThrow();
	});

	test('should handle type variables in complex expressions', () => {
		const code = `
			constraint MyShow a ( show: a -> String );
			implement MyShow (Option a) ( show = fn opt => "some option" )
		`;
		
		const result = parseAndType(code);
		
		expect(result.type.kind).toBe('unit');
		const showImpls = result.state.traitRegistry.implementations.get('MyShow');
		expect(showImpls?.has('Option')).toBe(true);
	});
});