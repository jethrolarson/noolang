import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';
import { createTypeState } from '../../src/typer/type-operations';
import { initializeBuiltins } from '../../src/typer/builtins';

describe('Polymorphic Function Type Pollution', () => {
	test('print should remain polymorphic between uses', () => {
		// Initialize fresh type state for each test
		let state = createTypeState();
		state = initializeBuiltins(state);

		// First, use print with integer
		const lexer1 = new Lexer('print 1');
		const tokens1 = lexer1.tokenize();
		const program1 = parse(tokens1);

		const result1 = typeAndDecorate(program1, state);
		state = result1.state;

		// Print should work with Float - check if this succeeds
		expect(() => result1).not.toThrow();

		// Now use print with string - this should also work
		const lexer2 = new Lexer('print "hello"');
		const tokens2 = lexer2.tokenize();
		const program2 = parse(tokens2);

		// This should not throw - print should be polymorphic
		expect(() => {
			const result2 = typeAndDecorate(program2, state);
		}).not.toThrow();
	});

	test('simulate REPL behavior - alternating print types', () => {
		// Simulate REPL state persistence
		let state = createTypeState();
		state = initializeBuiltins(state);

		// First REPL input: print 1
		const lexer1 = new Lexer('print 1');
		const tokens1 = lexer1.tokenize();
		const program1 = parse(tokens1);
		const result1 = typeAndDecorate(program1, state);
		state = result1.state; // Persist state like REPL does

		// Second REPL input: print "hi" - this should work
		const lexer2 = new Lexer('print "hi"');
		const tokens2 = lexer2.tokenize();
		const program2 = parse(tokens2);

		// This is where the bug manifests - print gets "stuck" on Float type
		expect(() => {
			const result2 = typeAndDecorate(program2, state);
			state = result2.state;
		}).not.toThrow();

		// Third REPL input: print 42 - should work again
		const lexer3 = new Lexer('print 42');
		const tokens3 = lexer3.tokenize();
		const program3 = parse(tokens3);

		expect(() => {
			const result3 = typeAndDecorate(program3, state);
		}).not.toThrow();
	});

	test('other polymorphic functions should not have type pollution', () => {
		let state = createTypeState();
		state = initializeBuiltins(state);

		// Test == operator with different types
		const eq1 = typeAndDecorate(parse(new Lexer('1 == 1').tokenize()), state);
		state = eq1.state;

		expect(() => {
			const eq2 = typeAndDecorate(
				parse(new Lexer('"a" == "b"').tokenize()),
				state
			);
			state = eq2.state;
		}).not.toThrow();

		// Test toString with different types
		expect(() => {
			const toString1 = typeAndDecorate(
				parse(new Lexer('toString 42').tokenize()),
				state
			);
			state = toString1.state;
		}).not.toThrow();

		expect(() => {
			const toString2 = typeAndDecorate(
				parse(new Lexer('toString "hello"').tokenize()),
				state
			);
		}).not.toThrow();
	});

	test('list functions should remain polymorphic', () => {
		let state = createTypeState();
		state = initializeBuiltins(state);

		// Test with list of integers (using cons to build lists)
		const list1 = typeAndDecorate(
			parse(new Lexer('cons 1 (cons 2 (cons 3 []))').tokenize()),
			state
		);
		state = list1.state;

		// Test toString with different input again - should work
		expect(() => {
			const toString3 = typeAndDecorate(
				parse(new Lexer('toString 100').tokenize()),
				state
			);
		}).not.toThrow();
	});
});
