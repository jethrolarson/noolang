import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

const parseAndType = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const { typeProgram } = require('../index');
	return typeProgram(program);
};

test('Trait System Conflicting Functions Safety - should allow multiple traits to define the same function name', () => {
	// This should work because multiple traits can define the same function name
	// The conflict is only detected when multiple implementations exist for the same type
	const code = `
		constraint Processable a ( process: a -> String );
		constraint Formatter a ( process: a -> String );
		implement Processable Float ( process = toString );
		implement Formatter String ( process = fn s => s )
	`;
	
	// This should succeed because Float implements Processable and String implements Formatter
	// No ambiguity because each type has only one implementation of 'process'
	const result = parseAndType(code);
	assert.is(result.type.kind, 'unit');
	
	// Both traits should be registered
	assert.is(result.state.traitRegistry.definitions.has('Processable'), true);
	assert.is(result.state.traitRegistry.definitions.has('Formatter'), true);
	
	// Both implementations should exist
	const processableImpls = result.state.traitRegistry.implementations.get('Processable');
	const formatterImpls = result.state.traitRegistry.implementations.get('Formatter');
	assert.is(processableImpls?.has('Float'), true);
	assert.is(formatterImpls?.has('String'), true);
});

test('Trait System Conflicting Functions Safety - should allow different function names in multiple constraints', () => {
	// This should work because the function names don't conflict
	const code = `
		constraint Displayable a ( display: a -> String );
		constraint Formattable a ( format: a -> String );
		implement Displayable Float ( display = toString );
		implement Formattable Float ( format = toString )
	`;
	
	const result = parseAndType(code);
	assert.is(result.type.kind, 'unit');
	
	// Both traits should be registered
	assert.is(result.state.traitRegistry.definitions.has('Displayable'), true);
	assert.is(result.state.traitRegistry.definitions.has('Formattable'), true);
	
	// Both implementations should exist
	const displayImpls = result.state.traitRegistry.implementations.get('Displayable');
	const formatImpls = result.state.traitRegistry.implementations.get('Formattable');
	assert.is(displayImpls?.has('Float'), true);
	assert.is(formatImpls?.has('Float'), true);
});

test('Trait System Conflicting Functions Safety - should detect ambiguous function calls when multiple implementations exist', () => {
	// This tests a type that implements multiple traits with conflicting function names
	const setupCode = `
		constraint Stringify a ( convert: a -> String );
		constraint Display a ( convert: a -> String );
		implement Stringify Float ( convert = toString );
		implement Display Float ( convert = toString )
	`;
	
	// The setup should work (registering multiple implementations of 'convert' for Float)
	const setupResult = parseAndType(setupCode);
	assert.is(setupResult.type.kind, 'unit');
	
	// But using the conflicting function should error due to ambiguity
	assert.throws(() => parseAndType(setupCode + '; result = convert 42'), /ambiguous function call/i);
});

test('Trait System Conflicting Functions Safety - should detect conflicting function names at implementation level', () => {
	// Test for the real issue: same type implementing the same function through different traits
	const code = `
		constraint Printable a ( display: a -> String );
		constraint Displayable a ( display: a -> String );
		implement Printable Float ( display = toString );
		implement Displayable Float ( display = toString );
		result = display 42
	`;
	
	// This should fail because Float has two implementations of 'display'
	assert.throws(() => parseAndType(code), /ambiguous function call.*display.*Float/i);
});

test('Trait System Conflicting Functions Safety - should work when same function name exists but for different types', () => {
	// This should work because there's no ambiguity - each type has only one implementation
	const code = `
		constraint Printable a ( render: a -> String );
		constraint Displayable a ( render: a -> String );
		implement Printable Float ( render = toString );
		implement Displayable String ( render = fn s => s );
		result1 = render 42;
		result2 = render "hello"
	`;
	
	const result = parseAndType(code);
	assert.is(result.type.kind, 'primitive');
	assert.is(result.type.name, 'String');
});

test.run();