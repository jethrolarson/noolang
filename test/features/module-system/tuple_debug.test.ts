import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeAndDecorate } from '../../../src/typer';

// Debug test for tuple construction with function calls
test('debug - simple tuple construction', () => {
	const code = '{1, 2}';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const typedProgram = typeAndDecorate(program);
	
	console.log('Simple tuple type:', typedProgram.finalType);
	assert.ok(typedProgram.finalType, 'Should have a type');
});

test('debug - tuple with variable', () => {
	const code = 'a = 5; {a, 10}';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const typedProgram = typeAndDecorate(program);
	
	console.log('Variable tuple type:', typedProgram.finalType);
	assert.ok(typedProgram.finalType, 'Should have a type');
});

test('debug - tuple with function call', () => {
	const code = 'f = fn x => x * 2; {f 5, 10}';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	try {
		const typedProgram = typeAndDecorate(program);
		console.log('Function call tuple type:', typedProgram.finalType);
	} catch (error) {
		console.log('Function call tuple failed:', error.message);
		throw error;
	}
});

test('debug - tuple with accessor call', () => {
	const code = 'obj = { @double fn x => x * 2 }; {(@double obj 5), 10}';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	try {
		const typedProgram = typeAndDecorate(program);
		console.log('Accessor call tuple type:', typedProgram.finalType);
	} catch (error) {
		console.log('Accessor call tuple failed:', error.message);
		throw error;
	}
});

test.run();