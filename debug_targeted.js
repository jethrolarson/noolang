const { parse } = require('./dist/parser/parser.js');
const { Lexer } = require('./dist/lexer/lexer.js');
const { typeProgram, createTypeState } = require('./dist/typer/index.js');
const { initializeBuiltins } = require('./dist/typer/builtins.js');

const parseProgram = (source) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

console.log('=== Testing a simple case that should work ===');
try {
	const simpleProgram = parseProgram(`
		getName = @name;
		result = getName {@name "Alice"}
	`);
	console.log('Simple program parsed successfully');
	const simpleResult = typeProgram(simpleProgram);
	console.log('✅ Simple case: Success (this should work)');
	console.log('Type:', JSON.stringify(simpleResult.type, null, 2));
} catch (e) {
	console.log('❌ Simple case failed:', e.message);
}

console.log('\n=== Testing the failing case ===');
try {
	const failingProgram = parseProgram(`
		getName = @name;
		result = getName {@age 30}
	`);
	console.log('Failing program parsed successfully');
	
	// Try calling typeProgram exactly like the test does
	console.log('Calling typeProgram exactly like the test...');
	
	const failingResult = typeProgram(failingProgram);
	console.log('❌ Failing case did NOT throw (should have thrown!)');
	console.log('Type:', JSON.stringify(failingResult.type, null, 2));
} catch (e) {
	console.log('✅ Failing case correctly threw:', e.message);
}