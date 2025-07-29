const { Lexer } = require('./dist/lexer/lexer.js');
const { parse } = require('./dist/parser/parser.js');
const { Evaluator } = require('./dist/evaluator/evaluator.js');
const { typeProgram } = require('./dist/typer/index.js');

const runNoolang = (source) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const typeResult = typeProgram(program);
	const evaluator = new Evaluator();
	const evalResult = evaluator.evaluateProgram(program);
	return {
		typeResult,
		evalResult,
		finalValue: evalResult.finalResult,
	};
};

// Test the skipped tests
const skippedTests = [
	{
		name: 'Multiple ADT definitions',
		code: `
			type Color = Red | Green | Blue;
			type Size = Small | Medium | Large;
			
			item = {Red, Small};
			item
		`,
		expected: {
			tag: 'tuple',
			values: [
				{ tag: 'constructor', name: 'Red', args: [] },
				{ tag: 'constructor', name: 'Small', args: [] },
			],
		}
	},
	{
		name: 'Pattern matching on different ADTs separately',
		code: `
			type Color = Red | Green | Blue;
			type Size = Small | Medium | Large;
			
			colorToString = fn color => match color with (Red => "red"; Green => "green"; Blue => "blue");
			sizeToString = fn size => match size with (Small => "small"; Medium => "medium"; Large => "large");
			
			colorToString Red
		`,
		expected: {
			tag: 'string',
			value: 'red',
		}
	}
];

console.log('Testing previously skipped ADT tests...\n');

skippedTests.forEach((test, index) => {
	try {
		console.log(`${index + 1}. ${test.name}`);
		const result = runNoolang(test.code);
		
		const success = JSON.stringify(result.finalValue) === JSON.stringify(test.expected);
		console.log(`   Result: ${success ? 'PASS - Can be unskipped!' : 'FAIL - Keep skipped'}`);
		if (!success) {
			console.log(`   Expected: ${JSON.stringify(test.expected, null, 2)}`);
			console.log(`   Got:      ${JSON.stringify(result.finalValue, null, 2)}`);
		}
		console.log('');
	} catch (e) {
		console.log(`   Result: ERROR - Keep skipped (${e.message})`);
		console.log('');
	}
});