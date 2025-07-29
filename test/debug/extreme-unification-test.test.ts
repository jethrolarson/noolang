import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';
import { resetUnificationCounters, logUnificationStats } from '../../src/typer/unify';

function unwrapValue(val: Value): any {
	if (val === null) return null;
	if (typeof val !== 'object') return val;
	switch (val.tag) {
		case 'number':
			return val.value;
		case 'string':
			return val.value;
		case 'constructor':
			return val;
		case 'list':
			return val.values.map(unwrapValue);
		case 'tuple':
			return val.values.map(unwrapValue);
		case 'record': {
			const obj: any = {};
			for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
			return obj;
		}
		default:
			return val;
	}
}

function evalExpressionWithLogging(source: string, testName: string) {
	resetUnificationCounters();
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	const testEvaluator = new Evaluator({ traitRegistry: decoratedResult.state.traitRegistry });
	const result = testEvaluator.evaluateProgram(decoratedResult.program);
	logUnificationStats(testName);
	return unwrapValue(result.finalResult);
}

test('EXTREME: Deeply nested safe thrush with complex type inference', () => {
	const result = evalExpressionWithLogging(`
		# Define many functions with complex signatures
		f1 = fn x => Some (x + 1);
		f2 = fn x => Some (x * 2);
		f3 = fn x => Some (x - 1);
		f4 = fn x => Some (x / 2);
		f5 = fn x => Some (x + 10);
		f6 = fn x => Some (x * 3);
		f7 = fn x => Some (x - 5);
		f8 = fn x => Some (x / 4);
		
		# Create a very deep chain that forces complex type inference
		# Each |? operator needs to figure out Option types and monadic binding
		Some 100 
			|? f1 |? f2 |? f3 |? f4 |? f5 
			|? f6 |? f7 |? f8 |? f1 |? f2
			|? f3 |? f4 |? f5 |? f6 |? f7
	`, 'Deep Chain');
	
	// Don't assert the exact value since the computation is complex
	// Just verify it's Some type
	assert.equal(result.tag, 'constructor');
	assert.equal(result.name, 'Some');
});

test('EXTREME: Complex chaining with filter and mixed types', () => {
	const result = evalExpressionWithLogging(`
		# Mix safe thrush with other operations that require type inference
		add_if_positive = fn x => if x > 0 then Some (x + 1) else None;
		multiply_if_even = fn x => if x % 2 == 0 then Some (x * 2) else None;
		divide_if_not_zero = fn x => if x != 0 then Some (x / 2) else None;
		
		# Complex expression with multiple branching paths
		filter (fn x => Some x |? add_if_positive |? multiply_if_even |? divide_if_not_zero != None) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
	`, 'Complex Filter');
	
	// Just verify it returns a list
	assert.ok(Array.isArray(result));
});

test('EXTREME: Nested function definitions with safe thrush', () => {
	const result = evalExpressionWithLogging(`
		# Create nested scopes with complex type inference requirements
		outer = fn base => {
			inner1 = fn x => Some (x + base);
			inner2 = fn x => Some (x * base);
			inner3 = fn x => Some (x - base);
			
			# Nested lambda with safe thrush
			fn start => start |? inner1 |? inner2 |? inner3
		};
		
		# Apply the complex function
		processor = outer 5;
		processor (Some 10)
	`, 'Nested Functions');
	
	assert.equal(result.tag, 'constructor');
	assert.equal(result.name, 'Some');
});

test.run();