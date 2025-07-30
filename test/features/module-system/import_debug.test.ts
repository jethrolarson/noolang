import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeAndDecorate } from '../../../src/typer';
import { Evaluator } from '../../../src/evaluator/evaluator';

// Debug test for import type inference
test('debug - simple import type inference', () => {
	const code = 'math = import "math_functions"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	console.log('Program statements:', program.statements.length);
	console.log('First statement kind:', program.statements[0]?.kind);
	
	try {
		const typedProgram = typeAndDecorate(program);
		console.log('Program finalType:', typedProgram.finalType);
		console.log('Program state available:', !!typedProgram.state);
		
		// Check if the first statement has been decorated with types
		const firstStatement = typedProgram.program.statements[0];
		console.log('First statement type:', firstStatement?.type);
	} catch (error) {
		console.log('Type checking failed:', error);
		throw error;
	}
	
	assert.ok(true, 'Should not throw');
});

// Debug test for simple assignment
test('debug - simple assignment type inference', () => {
	const code = 'x = 42';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	console.log('Simple program statements:', program.statements.length);
	
	try {
		const typedProgram = typeAndDecorate(program);
		console.log('Simple program finalType:', typedProgram.finalType);
		console.log('Simple first statement type:', typedProgram.program.statements[0]?.type);
	} catch (error) {
		console.log('Simple type checking failed:', error);
		throw error;
	}
	
	assert.ok(true, 'Should not throw');
});

test.run();