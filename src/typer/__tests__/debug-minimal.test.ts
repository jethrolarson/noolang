import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

describe('Debug Minimal Parser Test', () => {
	test('compare CLI success vs Jest failure', () => {
		// This exact string works with CLI
		const code = 'constraint Show a ( show : a -> String )';
		
		console.log('Input code:', JSON.stringify(code));
		
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		
		console.log('Tokens:', tokens.slice(0, 10).map(t => ({ type: t.type, value: t.value })));
		
		// Call parse exactly like the CLI does
		try {
			const program = parse(tokens);
			console.log('SUCCESS: Parsed program with', program.statements.length, 'statements');
			console.log('First statement kind:', program.statements[0]?.kind);
			
			// Now try type checking like the tests do
			const { typeProgram } = require('../index');
			console.log('About to call typeProgram...');
			const typeResult = typeProgram(program);
			console.log('Type result:', typeResult);
			console.log('Type result keys:', Object.keys(typeResult));
			
			if (typeResult.errors) {
				console.log('Type check result - errors:', typeResult.errors.length);
				if (typeResult.errors.length > 0) {
					console.log('Type errors:', typeResult.errors.map(e => e.message));
				} else {
					console.log('Type check SUCCESS');
				}
			} else {
				console.log('Type result has no errors property');
			}
		} catch (error) {
			console.log('FAILURE: Error:', error.message);
			console.log('This is the same string that works in CLI!');
		}
	});
});