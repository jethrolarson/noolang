import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

describe('Debug Parser for Constraint Definitions', () => {
	test('should parse simple constraint definition', () => {
		const code = 'constraint Functor f { map: (a -> b) -> f a -> f b }';
		
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		
		console.log('Tokens:', tokens.slice(0, 10).map(t => ({ type: t.type, value: t.value })));
		
		try {
			const program = parse(tokens);
			console.log('Parsed successfully:', program.statements[0]);
			expect(program.statements.length).toBe(1);
			expect(program.statements[0].kind).toBe('constraint-definition');
		} catch (error) {
			console.log('Parse error:', error.message);
			throw error;
		}
	});

	test('should parse simple implement definition', () => {
		const code = `
			constraint Functor f { map: (a -> b) -> f a -> f b }
			implement Functor Option { map f opt = case opt { Some x -> Some (f x); None -> None } }
		`;
		
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		
		try {
			const program = parse(tokens);
			console.log('Parsed successfully:', program.statements.length, 'statements');
			console.log('First statement:', program.statements[0]?.kind);
			console.log('Second statement:', program.statements[1]?.kind);
			expect(program.statements.length).toBe(2);
		} catch (error) {
			console.log('Parse error:', error.message);
			throw error;
		}
	});
});