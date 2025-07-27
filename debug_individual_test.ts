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

// Test a simple ADT test to see if it works
test('Simple ADT test - Option Some', () => {
	try {
		const result = runNoolang(`
			opt = Some 42;
			opt
		`);

		assert.equal(result.finalValue, {
			tag: 'constructor',
			name: 'Some',
			args: [{ tag: 'number', value: 42 }],
		});
		console.log('✅ Simple Some test passed');
	} catch (error) {
		console.log('❌ Simple Some test failed:', error.message);
		throw error;
	}
});

// Test a more complex one
test('Complex ADT test - Result type', () => {
	try {
		const result = runNoolang(`
			type Result a b = Ok a | Err b;
			
			divide = fn x => fn y => 
			  if y == 0 then Err "Division by zero" else Ok (x / y);
			
			result1 = divide 10 2;
			result1
		`);

		assert.equal(result.finalValue, {
			tag: 'constructor',
			name: 'Ok',
			args: [{ tag: 'number', value: 5 }],
		});
		console.log('✅ Complex Result test passed');
	} catch (error) {
		console.log('❌ Complex Result test failed:', error.message);
		throw error;
	}
});

test.run();