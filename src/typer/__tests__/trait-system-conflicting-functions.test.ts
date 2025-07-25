import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

describe('Trait System Conflicting Functions Safety', () => {
	const parseAndType = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		
		const { typeProgram } = require('../index');
		return typeProgram(program);
	};

	test('should allow multiple traits to define the same function name', () => {
		// This should work because multiple traits can define the same function name
		// The conflict is only detected when multiple implementations exist for the same type
		const code = `
			constraint Processable a ( process: a -> String );
			constraint Formatter a ( process: a -> String );
			implement Processable Int ( process = toString );
			implement Formatter String ( process = fn s => s )
		`;
		
		// This should succeed because Int implements Processable and String implements Formatter
		// No ambiguity because each type has only one implementation of 'process'
		const result = parseAndType(code);
		expect(result.type.kind).toBe('unit');
		
		// Both traits should be registered
		expect(result.state.traitRegistry.definitions.has('Processable')).toBe(true);
		expect(result.state.traitRegistry.definitions.has('Formatter')).toBe(true);
		
		// Both implementations should exist
		const processableImpls = result.state.traitRegistry.implementations.get('Processable');
		const formatterImpls = result.state.traitRegistry.implementations.get('Formatter');
		expect(processableImpls?.has('Int')).toBe(true);
		expect(formatterImpls?.has('String')).toBe(true);
	});

	test('should allow different function names in multiple constraints', () => {
		// This should work because the function names don't conflict
		const code = `
			constraint Displayable a ( display: a -> String );
			constraint Formattable a ( format: a -> String );
			implement Displayable Int ( display = toString );
			implement Formattable Int ( format = toString )
		`;
		
		const result = parseAndType(code);
		expect(result.type.kind).toBe('unit');
		
		// Both traits should be registered
		expect(result.state.traitRegistry.definitions.has('Displayable')).toBe(true);
		expect(result.state.traitRegistry.definitions.has('Formattable')).toBe(true);
		
		// Both implementations should exist
		const displayImpls = result.state.traitRegistry.implementations.get('Displayable');
		const formatImpls = result.state.traitRegistry.implementations.get('Formattable');
		expect(displayImpls?.has('Int')).toBe(true);
		expect(formatImpls?.has('Int')).toBe(true);
	});

	test('should detect ambiguous function calls when multiple implementations exist', () => {
		// This tests a type that implements multiple traits with conflicting function names
		const setupCode = `
			constraint Stringify a ( convert: a -> String );
			constraint Display a ( convert: a -> String );
			implement Stringify Int ( convert = toString );
			implement Display Int ( convert = toString )
		`;
		
		// The setup should work (registering multiple implementations of 'convert' for Int)
		const setupResult = parseAndType(setupCode);
		expect(setupResult.type.kind).toBe('unit');
		
		// But using the conflicting function should error due to ambiguity
		expect(() => parseAndType(setupCode + '; result = convert 42')).toThrow(/ambiguous function call/i);
	});

	test('should detect conflicting function names at implementation level', () => {
		// Test for the real issue: same type implementing the same function through different traits
		const code = `
			constraint Printable a ( display: a -> String );
			constraint Displayable a ( display: a -> String );
			implement Printable Int ( display = toString );
			implement Displayable Int ( display = toString );
			result = display 42
		`;
		
		// This should fail because Int has two implementations of 'display'
		expect(() => parseAndType(code)).toThrow(/ambiguous function call.*display.*Int/i);
	});

	test('should work when same function name exists but for different types', () => {
		// This should work because there's no ambiguity - each type has only one implementation
		const code = `
			constraint Printable a ( render: a -> String );
			constraint Displayable a ( render: a -> String );
			implement Printable Int ( render = toString );
			implement Displayable String ( render = fn s => s );
			result1 = render 42;
			result2 = render "hello"
		`;
		
		const result = parseAndType(code);
		expect(result.type.kind).toBe('primitive');
		expect(result.type.name).toBe('String');
	});
});