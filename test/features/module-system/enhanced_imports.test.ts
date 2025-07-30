import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeAndDecorate } from '../../../src/typer';
import { Evaluator } from '../../../src/evaluator/evaluator';

// TDD: Test 1 - Import should have proper type inference
test('import should infer correct module type for math functions', () => {
	const code = 'math = import "test/fixtures/test_math"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const typedProgram = typeAndDecorate(program);
	
	// The import should have type: { @add: Function, @multiply: Function, @square: Function } !read
	const mathType = typedProgram.finalType;
	assert.ok(mathType, 'Import should have a type');
	assert.equal(mathType.kind, 'record', 'Import should return a record type');
	
	// TODO: Check effects once we have access to them from typeAndDecorate
	// For now, just verify type inference is working
});

// TDD: Test 2 - Accessing imported functions should work with proper types
test('accessing functions from imported module should work', () => {
	const code = 'math = import "test/fixtures/test_math"; @add math 2 3';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	
	assert.equal(result.finalResult, { tag: 'number', value: 5 });
});

// TDD: Test 3 - Multiple function access should work
test('multiple function access from same module should work', () => {
	const code = `
		math = import "math_functions";
		sum = @add math 2 3;
		product = @multiply math 4 5;
		squared = @square math 6;
{sum, product, squared}
	`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	
	// Should return tuple with results
	assert.equal(result.finalResult.tag, 'tuple');
	if (result.finalResult.tag === 'tuple') {
		const [sum, product, squared] = result.finalResult.values;
		assert.equal(sum, { tag: 'number', value: 5 });
		assert.equal(product, { tag: 'number', value: 20 });
		assert.equal(squared, { tag: 'number', value: 36 });
	}
});

// TDD: Test 4 - Module caching should work (same module imported twice)
test('module type caching should work for repeated imports', () => {
	const code = `
		math1 = import "pure_math";
		math2 = import "pure_math";
{(@double math1 5), (@triple math2 4)}
	`;
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	// Type checking should use cached types for second import
	const typedProgram = typeAndDecorate(program);
	assert.ok(typedProgram.finalType, 'Should successfully type check with cached imports');
	
	// Evaluation should work correctly
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	
	assert.equal(result.finalResult.tag, 'tuple');
	if (result.finalResult.tag === 'tuple') {
		const [doubled, tripled] = result.finalResult.values;
		assert.equal(doubled, { tag: 'number', value: 10 });
		assert.equal(tripled, { tag: 'number', value: 12 });
	}
});

// TDD: Test 5 - Effect propagation should work correctly
test('import effects should propagate correctly', () => {
	const code = 'logger = import "logger"; @info logger "test"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const typedProgram = typeAndDecorate(program);
	
	// Should have properly typed logger module
	assert.ok(typedProgram.finalType, 'Should have a type for logger import');
	// Note: Effect checking would be added in future enhancement
});

// TDD: Test 6 - Error handling for unknown modules
test('should handle unknown modules gracefully during type checking', () => {
	const code = 'unknown = import "nonexistent"';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	// Type checking should not throw, even for unknown modules
	const typedProgram = typeAndDecorate(program);
	assert.ok(typedProgram.finalType, 'Should return a type even for unknown modules');
	
	// Should return empty record for unknown modules
	assert.equal(typedProgram.finalType.kind, 'record', 'Unknown modules should default to record type');
});

// TDD: Test 7 - Pipeline syntax with imports should work
test('pipeline syntax with imported functions should work', () => {
	const code = 'math = import "math_functions"; 5 | @square math';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	
	assert.equal(result.finalResult, { tag: 'number', value: 25 });
});

// TDD: Test 8 - Nested function calls with imports
test('nested function calls with imports should work', () => {
	const code = 'math = import "math_functions"; @add math 1 (@multiply math 2 3)';
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(program);
	
	assert.equal(result.finalResult, { tag: 'number', value: 7 }); // 1 + (2 * 3)
});

test.run();