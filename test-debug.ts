import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from './src/lexer/lexer';
import { parse } from './src/parser/parser';
import { Evaluator } from './src/evaluator/evaluator';
import { typeProgram } from './src/typer';
import { typeToString } from './src/typer/helpers';

// Helper function to parse and evaluate Noolang code
const runNoolang = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	// Type check first
	const typeResult = typeProgram(program);

	// Then evaluate
	const evaluator = new Evaluator();
	const evalResult = evaluator.evaluateProgram(program);

	return {
		typeResult,
		evalResult,
		finalType: typeToString(typeResult.type, typeResult.state.substitution),
		finalValue: evalResult.finalResult,
	};
};

test('Debug Test 1 - should handle type mismatches in pattern matching', () => {
	console.log('Running debug test 1');
	assert.throws(() => {
		runNoolang(`
          type Color = Red | Green | Blue;
          x = Red;
          match x with (
            Some _ => "matched";
            None => "none"
          )
        `);
	});
	console.log('Debug test 1 completed');
});

test('Debug Test 2 - should handle incomplete pattern matches', () => {
	console.log('Running debug test 2');
	assert.throws(() => {
		runNoolang(`
          opt = Some 42;
          match opt with (
            Some x => x
          )
        `);
	});
	console.log('Debug test 2 completed');
});

test('Debug Test 3 - simple test', () => {
	console.log('Running debug test 3');
	const result = runNoolang(`42`);
	assert.equal(result.finalValue, { tag: 'number', value: 42 });
	console.log('Debug test 3 completed');
});

test.run();