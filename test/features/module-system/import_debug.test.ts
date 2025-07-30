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
	const typedProgram = typeAndDecorate(program);
	
	console.log('Program type:', typedProgram.type);
	console.log('Program effects:', typedProgram.effects);
	
	assert.ok(typedProgram.type, 'Should have a type');
});

// Debug test for unknown module
test('debug - unknown module type inference', () => {
	const code = 'unknown = import "nonexistent"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const typedProgram = typeAndDecorate(program);
	
	console.log('Unknown module type:', typedProgram.type);
	console.log('Unknown module effects:', typedProgram.effects);
	
	assert.ok(typedProgram.type, 'Should have a type');
});

test.run();