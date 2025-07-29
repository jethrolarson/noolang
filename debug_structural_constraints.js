const { parse } = require('./dist/parser/parser.js');
const { Lexer } = require('./dist/lexer/lexer.js');
const { typeProgram } = require('./dist/typer/index.js');

const parseProgram = (source) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

console.log('Testing structural constraint failures in detail...\n');

// Test case 1: accessor on record missing the field
try {
	console.log('=== Test 1: @name accessor on record with only @age field ===');
	const program1 = parseProgram(`
		getName = @name;
		result = getName {@age 30}
	`);
	console.log('Program parsed successfully');
	console.log('Calling typeProgram...');
	const result1 = typeProgram(program1);
	console.log('   ❌ ERROR: typeProgram did NOT throw (should have thrown!)');
	console.log('   Type result:', JSON.stringify(result1, null, 2));
} catch (e) {
	console.log('   ✅ SUCCESS: typeProgram threw an error (correct behavior)');
	console.log('   Error message:', e.message);
	console.log('   Stack trace:', e.stack);
}

console.log('\n');

// Test case 2: accessor on non-record type  
try {
	console.log('=== Test 2: @name accessor on number 42 ===');
	const program2 = parseProgram(`
		getName = @name;
		result = getName 42
	`);
	console.log('Program parsed successfully');
	console.log('Calling typeProgram...');
	const result2 = typeProgram(program2);
	console.log('   ❌ ERROR: typeProgram did NOT throw (should have thrown!)');
	console.log('   Type result:', JSON.stringify(result2, null, 2));
} catch (e) {
	console.log('   ✅ SUCCESS: typeProgram threw an error (correct behavior)');
	console.log('   Error message:', e.message);
	console.log('   Stack trace:', e.stack);
}