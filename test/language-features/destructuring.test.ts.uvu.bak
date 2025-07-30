import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Evaluator, Value } from '../../src/evaluator/evaluator';
import { parse } from '../../src/parser/parser';
import { Lexer } from '../../src/lexer/lexer';

function unwrapValue(val: Value): any {
	if (val === null) return null;
	if (typeof val !== 'object') return val;
	switch (val.tag) {
		case 'number':
			return val.value;
		case 'string':
			return val.value;
		case 'constructor':
			if (val.name === 'True') return true;
			if (val.name === 'False') return false;
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

test('should destructure simple tuple', () => {
	const source = '{x, y} = {1, 2}; x + y';
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	
	const parsed = parse(tokens);
	
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(parsed);
	assert.equal(unwrapValue(result.finalResult), 3);
});

test('should destructure record with shorthand', () => {
	const source = '{@name, @age} = {@name "Bob", @age 25}; name + " is " + toString age';
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	
	const parsed = parse(tokens);
	
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(parsed);
	assert.equal(unwrapValue(result.finalResult), "Bob is 25");
});

test('should fail parsing for list destructuring', () => {
	const source = '[x, y] = [1, 2]';
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	
	assert.throws(() => parse(tokens), 'Should fail to parse list destructuring');
});

test.run();