import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';

describe('Debug Lexer for Constraint Keywords', () => {
	test('should tokenize constraint keyword correctly', () => {
		const code = 'constraint Functor f { map: (a -> b) -> f a -> f b }';
		
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		
		console.log('Tokens:', tokens.map(t => ({ type: t.type, value: t.value })));
		
		expect(tokens[0].type).toBe('KEYWORD');
		expect(tokens[0].value).toBe('constraint');
	});

	test('should tokenize implement keyword correctly', () => {
		const code = 'implement Functor Option { map f opt = Some f }';
		
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		
		console.log('Tokens:', tokens.map(t => ({ type: t.type, value: t.value })));
		
		expect(tokens[0].type).toBe('KEYWORD');
		expect(tokens[0].value).toBe('implement');
	});
});