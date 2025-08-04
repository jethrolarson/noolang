import { Lexer } from '../../lexer/lexer';
import { test, expect } from 'bun:test';

// Helper function to create lexer and get all tokens
const tokenize = (input: string) => new Lexer(input).tokenize();

// Helper function to get token values without location info
const getTokenValues = (input: string) =>
	tokenize(input).map(token => ({ type: token.type, value: token.value }));

test('Lexer - Numbers - should tokenize integers', () => {
	const tokens = getTokenValues('123');
	expect(tokens).toEqual([
		{ type: 'NUMBER', value: '123' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Numbers - should tokenize floating point numbers', () => {
	const tokens = getTokenValues('123.456');
	expect(tokens).toEqual([
		{ type: 'NUMBER', value: '123.456' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Numbers - should tokenize number followed by non-digit', () => {
	const tokens = getTokenValues('123abc');
	expect(tokens).toEqual([
		{ type: 'NUMBER', value: '123' },
		{ type: 'IDENTIFIER', value: 'abc' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Numbers - should not tokenize dot without following digit as float', () => {
	const tokens = getTokenValues('123.');
	expect(tokens).toEqual([
		{ type: 'NUMBER', value: '123' },
		{ type: 'PUNCTUATION', value: '.' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Strings - should tokenize double-quoted strings', () => {
	const tokens = getTokenValues('"hello world"');
	expect(tokens).toEqual([
		{ type: 'STRING', value: 'hello world' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Strings - should tokenize single-quoted strings', () => {
	const tokens = getTokenValues("'hello world'");
	expect(tokens).toEqual([
		{ type: 'STRING', value: 'hello world' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Strings - should handle escaped characters in strings', () => {
	const tokens = getTokenValues('"hello \\"world\\""');
	expect(tokens).toEqual([
		{ type: 'STRING', value: 'hello "world"' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Strings - should handle unclosed strings', () => {
	const tokens = getTokenValues('"hello');
	expect(tokens).toEqual([
		{ type: 'STRING', value: 'hello' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Strings - should handle escaped backslash at end of string', () => {
	const tokens = getTokenValues('"hello\\\\"');
	expect(tokens).toEqual([
		{ type: 'STRING', value: 'hello\\' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Strings - should handle escape sequence at end of input', () => {
	const tokens = getTokenValues('"hello\\');
	expect(tokens).toEqual([
		{ type: 'STRING', value: 'hello' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Identifiers and Keywords - should tokenize basic identifiers', () => {
	const tokens = getTokenValues('variable');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'variable' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Identifiers and Keywords - should tokenize identifiers with underscores and numbers', () => {
	const tokens = getTokenValues('var_123');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'var_123' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Identifiers and Keywords - should recognize keywords', () => {
	const keywords = [
		'if', 'then', 'else', 'let', 'in', 'fn', 'import', 'mut', 'where',
		'variant', 'match', 'with', 'given', 'is', 'and', 'or', 'implements',
		'constraint', 'implement'
	];

	for (const keyword of keywords) {
		const tokens = getTokenValues(keyword);
		expect(tokens).toEqual([
			{ type: 'KEYWORD', value: keyword },
			{ type: 'EOF', value: '' },
		]);
	}
});

test('Lexer - Identifiers and Keywords - should recognize primitive type keywords', () => {
	const primitives = ['Float', 'Number', 'String', 'Unit', 'List'];

	for (const primitive of primitives) {
		const tokens = getTokenValues(primitive);
		expect(tokens).toEqual([
			{ type: 'KEYWORD', value: primitive },
			{ type: 'EOF', value: '' },
		]);
	}
});

test('Lexer - Identifiers and Keywords - should handle mut! special case', () => {
	const tokens = getTokenValues('mut!');
	expect(tokens).toEqual([
		{ type: 'KEYWORD', value: 'mut!' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Identifiers and Keywords - should handle mut without exclamation', () => {
	const tokens = getTokenValues('mut');
	expect(tokens).toEqual([
		{ type: 'KEYWORD', value: 'mut' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Identifiers and Keywords - should handle identifiers starting with underscore', () => {
	const tokens = getTokenValues('_private');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: '_private' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Operators - should tokenize multi-character operators', () => {
	const multiCharOps = ['|>', '<|', '==', '!=', '<=', '>=', '=>', '->'];

	for (const op of multiCharOps) {
		const tokens = getTokenValues(op);
		expect(tokens).toEqual([
			{ type: 'OPERATOR', value: op },
			{ type: 'EOF', value: '' },
		]);
	}
});

test('Lexer - Operators - should tokenize single-character operators', () => {
	const singleCharOps = ['+', '-', '*', '/', '<', '>', '=', '|', '$'];

	for (const op of singleCharOps) {
		const tokens = getTokenValues(op);
		expect(tokens).toEqual([
			{ type: 'OPERATOR', value: op },
			{ type: 'EOF', value: '' },
		]);
	}
});

test('Lexer - Operators - should prefer multi-character operators over single', () => {
	const tokens = getTokenValues('==');
	expect(tokens).toEqual([
		{ type: 'OPERATOR', value: '==' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Operators - should handle operators in sequence', () => {
	const tokens = getTokenValues('+-*/');
	expect(tokens).toEqual([
		{ type: 'OPERATOR', value: '+' },
		{ type: 'OPERATOR', value: '-' },
		{ type: 'OPERATOR', value: '*' },
		{ type: 'OPERATOR', value: '/' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Operators - should handle single character operator fallback', () => {
	const tokens = getTokenValues('!');
	expect(tokens).toEqual([
		{ type: 'OPERATOR', value: '!' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Punctuation - should tokenize punctuation characters', () => {
	const punctuation = ['(', ')', ',', ';', ':', '[', ']', '{', '}'];

	for (const punct of punctuation) {
		const tokens = getTokenValues(punct);
		expect(tokens).toEqual([
			{ type: 'PUNCTUATION', value: punct },
			{ type: 'EOF', value: '' },
		]);
	}
});

test('Lexer - Punctuation - should handle period as punctuation', () => {
	const tokens = getTokenValues('.');
	expect(tokens).toEqual([
		{ type: 'PUNCTUATION', value: '.' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Accessors - should tokenize basic accessor', () => {
	const tokens = getTokenValues('@field');
	expect(tokens).toEqual([
		{ type: 'ACCESSOR', value: 'field' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Accessors - should tokenize accessor with numbers and underscores', () => {
	const tokens = getTokenValues('@field_123');
	expect(tokens).toEqual([
		{ type: 'ACCESSOR', value: 'field_123' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Accessors - should handle @ without following identifier', () => {
	const tokens = getTokenValues('@');
	expect(tokens).toEqual([
		{ type: 'ACCESSOR', value: '' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Accessors - should handle @ followed by non-identifier', () => {
	const tokens = getTokenValues('@(');
	expect(tokens).toEqual([
		{ type: 'ACCESSOR', value: '' },
		{ type: 'PUNCTUATION', value: '(' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Comments - should skip single-line comments', () => {
	const codeWithComments = `
		# this is a comment
		x = 5 # inline comment
		y = 10
		# another comment
		x + y # trailing comment
	`;
	const codeWithoutComments = `
		x = 5
		y = 10
		x + y
	`;
	const tokensWithComments = tokenize(codeWithComments);
	const tokensWithoutComments = tokenize(codeWithoutComments);
	const stripLoc = (t: any) => ({ type: t.type, value: t.value });
	expect(tokensWithComments.map(stripLoc)).toEqual(tokensWithoutComments.map(stripLoc));
	expect(tokensWithComments.some(t => t.type === 'COMMENT')).toEqual(false);
});

test('Lexer - Comments - should handle comment at end of file', () => {
	const tokens = getTokenValues('x # comment');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Comments - should handle multiple comments', () => {
	const tokens = getTokenValues('# comment1\n# comment2\nx');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Comments - should handle comment encountered in nextToken', () => {
	const lexer = new Lexer('# comment\n');
	const token = lexer.nextToken();
	expect(token.type).toEqual('EOF');
});

test('Lexer - Whitespace handling - should skip whitespace', () => {
	const tokens = getTokenValues('  \t  x  \n  y  ');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'IDENTIFIER', value: 'y' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Whitespace handling - should handle empty input', () => {
	const tokens = getTokenValues('');
	expect(tokens).toEqual([{ type: 'EOF', value: '' }]);
});

test('Lexer - Whitespace handling - should handle whitespace only', () => {
	const tokens = getTokenValues('   \t\n  ');
	expect(tokens).toEqual([{ type: 'EOF', value: '' }]);
});

test('Lexer - Unknown characters - should handle unknown characters as punctuation', () => {
	const tokens = getTokenValues('~');
	expect(tokens).toEqual([
		{ type: 'PUNCTUATION', value: '~' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Unknown characters - should handle unknown characters that are whitespace', () => {
	const tokens = getTokenValues('x\u00A0y');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'IDENTIFIER', value: 'y' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Unknown characters - should handle unknown whitespace characters in nextToken path', () => {
	const lexer = new Lexer('\u00A0');
	const token = lexer.nextToken();
	expect(token.type).toEqual('EOF');
});

test('Lexer - Line and column tracking - should track line and column positions', () => {
	const lexer = new Lexer('x\ny');
	const tokens = lexer.tokenize();

	expect(tokens[0].location.start.line).toEqual(1);
	expect(tokens[0].location.start.column).toEqual(1);
	expect(tokens[0].location.end.line).toEqual(1);
	expect(tokens[0].location.end.column).toEqual(2);

	expect(tokens[1].location.start.line).toEqual(2);
	expect(tokens[1].location.start.column).toEqual(1);
	expect(tokens[1].location.end.line).toEqual(2);
	expect(tokens[1].location.end.column).toEqual(2);
});

test('Lexer - Line and column tracking - should handle column advancement', () => {
	const lexer = new Lexer('abc');
	const tokens = lexer.tokenize();

	expect(tokens[0].location.start.line).toEqual(1);
	expect(tokens[0].location.start.column).toEqual(1);
	expect(tokens[0].location.end.line).toEqual(1);
	expect(tokens[0].location.end.column).toEqual(4);
});

test('Lexer - Complex expressions - should tokenize complex expression', () => {
	const tokens = getTokenValues('fn add(x, y) -> x + y\nlet result = add(1, 2)');
	expect(tokens).toEqual([
		{ type: 'KEYWORD', value: 'fn' },
		{ type: 'IDENTIFIER', value: 'add' },
		{ type: 'PUNCTUATION', value: '(' },
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'PUNCTUATION', value: ',' },
		{ type: 'IDENTIFIER', value: 'y' },
		{ type: 'PUNCTUATION', value: ')' },
		{ type: 'OPERATOR', value: '->' },
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'OPERATOR', value: '+' },
		{ type: 'IDENTIFIER', value: 'y' },
		{ type: 'KEYWORD', value: 'let' },
		{ type: 'IDENTIFIER', value: 'result' },
		{ type: 'OPERATOR', value: '=' },
		{ type: 'IDENTIFIER', value: 'add' },
		{ type: 'PUNCTUATION', value: '(' },
		{ type: 'NUMBER', value: '1' },
		{ type: 'PUNCTUATION', value: ',' },
		{ type: 'NUMBER', value: '2' },
		{ type: 'PUNCTUATION', value: ')' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Complex expressions - should handle mixed operators and punctuation', () => {
	const tokens = getTokenValues('(x == y) && z');
	expect(tokens).toEqual([
		{ type: 'PUNCTUATION', value: '(' },
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'OPERATOR', value: '==' },
		{ type: 'IDENTIFIER', value: 'y' },
		{ type: 'PUNCTUATION', value: ')' },
		{ type: 'PUNCTUATION', value: '&' },
		{ type: 'PUNCTUATION', value: '&' },
		{ type: 'IDENTIFIER', value: 'z' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Edge cases - should handle EOF conditions', () => {
	const lexer = new Lexer('');
	const token = lexer.nextToken();
	expect(token.type).toEqual('EOF');
	expect(token.value).toEqual('');
});

test('Lexer - Edge cases - should handle sequential whitespace and comments', () => {
	const tokens = getTokenValues('  # comment\n  \t# another\n x');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Edge cases - should handle operators at end of input', () => {
	const tokens = getTokenValues('x +');
	expect(tokens).toEqual([
		{ type: 'IDENTIFIER', value: 'x' },
		{ type: 'OPERATOR', value: '+' },
		{ type: 'EOF', value: '' },
	]);
});

