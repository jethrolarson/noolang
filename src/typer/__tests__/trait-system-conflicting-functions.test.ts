import { test, expect } from 'bun:test';
import { assertPrimitiveType, parseAndType } from '../../../test/utils';

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
	expect(result.type.kind).toBe('unit');

	// Both traits should be registered
	expect(result.state.traitRegistry.definitions.has('Processable')).toBe(true);
	expect(result.state.traitRegistry.definitions.has('Formatter')).toBe(true);

	// Both implementations should exist
	const processableImpls =
		result.state.traitRegistry.implementations.get('Processable');
	const formatterImpls =
		result.state.traitRegistry.implementations.get('Formatter');
	expect(processableImpls?.has('Float')).toBe(true);
	expect(formatterImpls?.has('String')).toBe(true);
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
	expect(result.type.kind).toBe('unit');

	// Both traits should be registered
	expect(result.state.traitRegistry.definitions.has('Displayable')).toBe(true);
	expect(result.state.traitRegistry.definitions.has('Formattable')).toBe(true);

	// Both implementations should exist
	const displayImpls =
		result.state.traitRegistry.implementations.get('Displayable');
	const formatImpls =
		result.state.traitRegistry.implementations.get('Formattable');
	expect(displayImpls?.has('Float')).toBe(true);
	expect(formatImpls?.has('Float')).toBe(true);
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
	expect(setupResult.type.kind).toBe('unit');

	// But using the conflicting function should error due to ambiguity
	expect(() => parseAndType(setupCode + '; result = convert 42')).toThrow();
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
	expect(() => parseAndType(code)).toThrow();
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
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});
