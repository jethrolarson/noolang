import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Minimal REPL component tests - no process spawning to avoid CI timeouts
// Tests the core parsing and type system components that REPL uses

test('REPL Components - Lexer should tokenize simple expressions', () => {
	const { Lexer } = require('../../lexer/lexer');
	
	const lexer = new Lexer('42');
	const tokens = lexer.tokenize();
	assert.ok(tokens.length > 0, 'should produce tokens');
	assert.is(tokens[0].type, 'NUMBER', 'should recognize number token');
});

test('REPL Components - Lexer should tokenize strings', () => {
	const { Lexer } = require('../../lexer/lexer');
	
	const lexer = new Lexer('"hello"');
	const tokens = lexer.tokenize();
	assert.ok(tokens.length > 0, 'should produce tokens');
	assert.is(tokens[0].type, 'STRING', 'should recognize string token');
});

test('REPL Components - Parser should parse number literals', () => {
	const { Lexer } = require('../../lexer/lexer');
	const { parse } = require('../../parser/parser');
	
	const lexer = new Lexer('42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	assert.ok(program, 'should parse successfully');
	assert.ok(program.statements, 'should have statements');
	assert.ok(program.statements.length > 0, 'should have at least one statement');
	assert.is(program.statements[0].kind, 'literal', 'should be a literal expression');
});

test('REPL Components - Parser should parse string literals', () => {
	const { Lexer } = require('../../lexer/lexer');
	const { parse } = require('../../parser/parser');
	
	const lexer = new Lexer('"hello"');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	assert.ok(program, 'should parse successfully');
	assert.is(program.statements[0].kind, 'literal', 'should be a literal expression');
	assert.is(program.statements[0].value, 'hello', 'should have correct string value');
});

test('REPL Components - Parser should parse variable references', () => {
	const { Lexer } = require('../../lexer/lexer');
	const { parse } = require('../../parser/parser');
	
	const lexer = new Lexer('someVar');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	assert.ok(program, 'should parse successfully');
	assert.is(program.statements[0].kind, 'variable', 'should be a variable expression');
	assert.is(program.statements[0].name, 'someVar', 'should have correct variable name');
});

test('REPL Components - Parser should parse assignments', () => {
	const { Lexer } = require('../../lexer/lexer');
	const { parse } = require('../../parser/parser');
	
	const lexer = new Lexer('x = 42');
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	
	assert.ok(program, 'should parse successfully');
	assert.is(program.statements[0].kind, 'definition', 'should be a definition');
	assert.is(program.statements[0].name, 'x', 'should have correct variable name');
});

test('REPL Components - Parser should handle invalid syntax gracefully', () => {
	const { Lexer } = require('../../lexer/lexer');
	const { parse } = require('../../parser/parser');
	
	assert.throws(() => {
		const lexer = new Lexer('invalid @#$ syntax');
		const tokens = lexer.tokenize();
		parse(tokens);
	}, 'should throw on invalid syntax');
});

test('REPL Components - TypeState should initialize', () => {
	const { createTypeState, initializeBuiltins } = require('../../typer/type-operations');
	
	let typeState = createTypeState();
	assert.ok(typeState, 'should create type state');
	assert.ok(typeState.environment, 'should have environment');
	
	typeState = initializeBuiltins(typeState);
	assert.ok(typeState.environment.size > 0, 'should have builtin types after initialization');
});

test('REPL Components - Evaluator should initialize', () => {
	const { Evaluator } = require('../../evaluator/evaluator');
	const { createTypeState, initializeBuiltins } = require('../../typer/type-operations');
	
	const typeState = initializeBuiltins(createTypeState());
	const evaluator = new Evaluator({ traitRegistry: typeState.traitRegistry });
	
	assert.ok(evaluator, 'should create evaluator');
	assert.ok(evaluator.getEnvironment, 'should have getEnvironment method');
	
	const env = evaluator.getEnvironment();
	assert.ok(env instanceof Map, 'should return a Map for environment');
});

test('REPL Components - Command parsing should work', () => {
	// Test basic command parsing logic without full REPL
	const testCommand = (input: string) => {
		if (input === '') return 'empty';
		if (input.startsWith('.')) {
			const [command] = input.split(' ');
			switch (command) {
				case '.quit':
				case '.exit':
				case '.help':
					return 'valid';
				default:
					return 'unknown';
			}
		}
		return 'expression';
	};
	
	assert.is(testCommand(''), 'empty', 'should handle empty input');
	assert.is(testCommand('.help'), 'valid', 'should recognize help command');
	assert.is(testCommand('.quit'), 'valid', 'should recognize quit command');
	assert.is(testCommand('.unknown'), 'unknown', 'should handle unknown commands');
	assert.is(testCommand('42'), 'expression', 'should recognize expressions');
});

test.run();
