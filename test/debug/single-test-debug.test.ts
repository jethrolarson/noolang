import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';

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

function evalExpression(source: string) {
	const tokens = new Lexer(source).tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	const testEvaluator = new Evaluator({ traitRegistry: decoratedResult.state.traitRegistry });
	const result = testEvaluator.evaluateProgram(decoratedResult.program);
	return unwrapValue(result.finalResult);
}

// Test the most complex case that might be causing high unification counts
test('SINGLE DEBUG: Complex chaining with multiple operators and mixed function types', () => {
	const result = evalExpression(`
        add_one = fn x => x + 1;
        to_none = fn x => None;
        multiply_two = fn x => x * 2;
        safe_wrap = fn x => Some (x * 2);
        
        # This chain involves multiple type checks and monadic operations
        Some 5 |? add_one |? to_none |? multiply_two |? safe_wrap
    `);
	assert.equal(result, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test.run();