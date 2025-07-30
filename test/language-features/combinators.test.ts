import { Lexer } from '../../src/lexer/lexer';
import * as C from '../../src/parser/combinators';
import { describe, test, expect } from 'bun:test';

// Helper function to create tokens for testing
const createTokens = (input: string) => {
	const lexer = new Lexer(input);
	return lexer.tokenize();
};

// Helper function to create tokens without EOF for testing
const createTokensWithoutEOF = (input: string) => {
	const lexer = new Lexer(input);
	const tokens = lexer.tokenize();
	// Remove EOF token for testing
	return tokens.filter(t => t.type !== 'EOF');
};

// Test suite: Parser Combinators
test('Parser Combinators - token - should match exact token type and value', () => {
	const tokens = createTokensWithoutEOF('42');
	const result = C.token('NUMBER', '42')(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('NUMBER');
		expect(result.value.value).toEqual('42');
		expect(result.remaining.length).toEqual(0);
	}
});

test('Parser Combinators - token - should match token type without value constraint', () => {
	const tokens = createTokens('42');
	const result = C.token('NUMBER')(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('NUMBER');
		expect(result.value.value).toEqual('42');
	}
});

test('Parser Combinators - token - should fail on wrong token type', () => {
	const tokens = createTokens('42');
	const result = C.token('IDENTIFIER')(tokens);

	expect(result.success).toEqual(false);
	if (!result.success) {
		expect(result.error.includes('Expected IDENTIFIER')).toBeTruthy();
		expect(result.error.includes('but got NUMBER')).toBeTruthy();
	}
});

test('Parser Combinators - token - should fail on wrong token value', () => {
	const tokens = createTokens('42');
	const result = C.token('NUMBER', '43')(tokens);

	expect(result.success).toEqual(false);
	if (!result.success) {
		expect(result.error.includes("Expected NUMBER '43'")).toBeTruthy();
		expect(result.error.includes("but got NUMBER '42'")).toBeTruthy();
	}
});

test('Parser Combinators - token - should fail on empty input', () => {
	const result = C.token('NUMBER')([]);

	expect(result.success).toEqual(false);
	if (!result.success) {
		expect(result.error.includes('Expected NUMBER')).toBeTruthy();
		expect(result.error.includes('but got end of input')).toBeTruthy();
	}
});

test('Parser Combinators - anyToken - should match any token', () => {
	const tokens = createTokensWithoutEOF('42');
	const result = C.anyToken()(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('NUMBER');
		expect(result.value.value).toEqual('42');
		expect(result.remaining.length).toEqual(0);
	}
});

test('Parser Combinators - anyToken - should fail on empty input', () => {
	const result = C.anyToken()([]);

	expect(result.success).toEqual(false);
	if (!result.success) {
		expect(result.error).toEqual('Expected any token, but got end of input');
	}
});

test('Parser Combinators - seq - should match sequence of parsers', () => {
	const tokens = createTokens('hello world');
	const result = C.seq(
		C.token('IDENTIFIER', 'hello'),
		C.token('IDENTIFIER', 'world')
	)(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(2);
		expect(result.value[0].value).toEqual('hello');
		expect(result.value[1].value).toEqual('world');
	}
});

test('Parser Combinators - seq - should fail if any parser in sequence fails', () => {
	const tokens = createTokens('hello 42');
	const result = C.seq(
		C.token('IDENTIFIER', 'hello'),
		C.token('IDENTIFIER', 'world')
	)(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - seq - should handle empty sequence', () => {
	const tokens = createTokens('hello');
	const result = C.seq()(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(0);
		expect(result.remaining).toEqual(tokens);
	}
});

test('Parser Combinators - choice - should match first successful parser', () => {
	const tokens = createTokens('42');
	const result = C.choice(
		C.token('IDENTIFIER'),
		C.token('NUMBER'),
		C.token('STRING')
	)(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('NUMBER');
		expect(result.value.value).toEqual('42');
	}
});

test('Parser Combinators - choice - should try all parsers in order', () => {
	const tokens = createTokens('hello');
	const result = C.choice(
		C.token('NUMBER'),
		C.token('STRING'),
		C.token('IDENTIFIER')
	)(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('IDENTIFIER');
		expect(result.value.value).toEqual('hello');
	}
});

test('Parser Combinators - choice - should fail if all parsers fail', () => {
	const tokens = createTokens('42');
	const result = C.choice(
		C.token('IDENTIFIER'),
		C.token('STRING'),
		C.token('PUNCTUATION')
	)(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - choice - should handle empty choice', () => {
	const tokens = createTokens('hello');
	const result = C.choice()(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - many - should match zero or more occurrences', () => {
	const tokens = createTokens('42 43 44');
	const result = C.many(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(3);
		expect(result.value[0].value).toEqual('42');
		expect(result.value[1].value).toEqual('43');
		expect(result.value[2].value).toEqual('44');
	}
});

test('Parser Combinators - many - should match zero occurrences', () => {
	const tokens = createTokens('hello');
	const result = C.many(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(0);
		expect(result.remaining).toEqual(tokens);
	}
});

test('Parser Combinators - many - should handle empty input', () => {
	const result = C.many(C.token('NUMBER'))([]);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(0);
	}
});

test('Parser Combinators - many1 - should match one or more occurrences', () => {
	const tokens = createTokens('42 43');
	const result = C.many1(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(2);
		expect(result.value[0].value).toEqual('42');
		expect(result.value[1].value).toEqual('43');
	}
});

test('Parser Combinators - many1 - should fail on zero occurrences', () => {
	const tokens = createTokens('hello');
	const result = C.many1(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - many1 - should fail on empty input', () => {
	const result = C.many1(C.token('NUMBER'))([]);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - optional - should match when parser succeeds', () => {
	const tokens = createTokens('42');
	const result = C.optional(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value !== null).toBeTruthy();
		if (result.value !== null) {
			expect(result.value.value).toEqual('42');
		}
	}
});

test('Parser Combinators - optional - should return null when parser fails', () => {
	const tokens = createTokens('hello');
	const result = C.optional(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value).toEqual(null);
		expect(result.remaining).toEqual(tokens);
	}
});

test('Parser Combinators - optional - should handle empty input', () => {
	const result = C.optional(C.token('NUMBER'))([]);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value).toEqual(null);
	}
});

test('Parser Combinators - map - should transform successful parse result', () => {
	const tokens = createTokens('42');
	const result = C.map(C.token('NUMBER'), (token) => parseInt(token.value))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value).toEqual(42);
	}
});

test('Parser Combinators - map - should preserve failure', () => {
	const tokens = createTokens('hello');
	const result = C.map(C.token('NUMBER'), (token) => parseInt(token.value))(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - lazy - should defer parser creation', () => {
	const tokens = createTokens('42');
	const result = C.lazy(() => C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.value).toEqual('42');
	}
});

test('Parser Combinators - lazy - should handle recursive parsers', () => {
	const tokens = createTokens('( ( 42 ) )');
	
	const expr: () => C.Parser<any> = () => C.choice(
		C.token('NUMBER'),
		C.map(
			C.seq(
				C.token('PUNCTUATION', '('),
				C.lazy(expr),
				C.token('PUNCTUATION', ')')
			),
			([_, inner, __]) => inner
		)
	);
	
	const result = expr()(tokens);
	expect(result.success).toEqual(true);
});

test('Parser Combinators - sepBy - should parse elements separated by separator', () => {
	const tokens = createTokens('42, 43, 44');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(3);
		expect(result.value[0].value).toEqual('42');
		expect(result.value[1].value).toEqual('43');
		expect(result.value[2].value).toEqual('44');
	}
});

test('Parser Combinators - sepBy - should parse single element', () => {
	const tokens = createTokens('42');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(1);
		expect(result.value[0].value).toEqual('42');
	}
});

test('Parser Combinators - sepBy - should parse zero elements', () => {
	const tokens = createTokens('hello');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(0);
	}
});

test('Parser Combinators - sepBy - should parse partial when separator is followed by invalid element', () => {
	const tokens = createTokens('42, hello');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(1);
		expect(result.value[0].value).toEqual('42');
	}
});

test('Parser Combinators - parseAll - should succeed when parser consumes all input', () => {
	const tokens = createTokensWithoutEOF('42');
	const result = C.parseAll(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.value).toEqual('42');
	}
});

test('Parser Combinators - parseAll - should fail when input remains', () => {
	const tokens = createTokens('42 hello');
	const result = C.parseAll(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - parseAll - should preserve parser failure', () => {
	const tokens = createTokens('hello');
	const result = C.parseAll(C.token('NUMBER'))(tokens);

	expect(result.success).toEqual(false);
});

test('Parser Combinators - convenience parsers - identifier should match identifiers', () => {
	const tokens = createTokens('hello');
	const result = C.identifier()(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('IDENTIFIER');
		expect(result.value.value).toEqual('hello');
	}
});

test('Parser Combinators - convenience parsers - number should match numbers', () => {
	const tokens = createTokens('42');
	const result = C.number()(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('NUMBER');
		expect(result.value.value).toEqual('42');
	}
});

test('Parser Combinators - convenience parsers - string should match strings', () => {
	const tokens = createTokens('"hello"');
	const result = C.string()(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('STRING');
		expect(result.value.value).toEqual('hello');
	}
});

test('Parser Combinators - convenience parsers - keyword should match specific keywords', () => {
	const tokens = createTokens('if');
	const result = C.keyword('if')(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('KEYWORD');
		expect(result.value.value).toEqual('if');
	}
});

test('Parser Combinators - convenience parsers - operator should match specific operators', () => {
	const tokens = createTokens('+');
	const result = C.operator('+')(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('OPERATOR');
		expect(result.value.value).toEqual('+');
	}
});

test('Parser Combinators - convenience parsers - punctuation should match specific punctuation', () => {
	const tokens = createTokens('(');
	const result = C.punctuation('(')(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('PUNCTUATION');
		expect(result.value.value).toEqual('(');
	}
});

test('Parser Combinators - convenience parsers - accessor should match accessors', () => {
	const tokens = createTokens('@name');
	const result = C.accessor()(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.type).toEqual('ACCESSOR');
		expect(result.value.value).toEqual('name');
	}
});

test('Parser Combinators - complex combinations - should handle nested sequences and choices', () => {
	const tokens = createTokens('if 42 then hello else world');
	const result = C.seq(
		C.keyword('if'),
		C.choice(C.number(), C.identifier()),
		C.keyword('then'),
		C.identifier(),
		C.keyword('else'),
		C.identifier()
	)(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(6);
		expect(result.value[0].value).toEqual('if');
		expect(result.value[1].value).toEqual('42');
		expect(result.value[3].value).toEqual('hello');
		expect(result.value[5].value).toEqual('world');
	}
});

test('Parser Combinators - complex combinations - should handle many with separator', () => {
	const tokens = createTokens('1, 2, 3, 4');
	const result = C.sepBy(C.number(), C.punctuation(','))(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(4);
		result.value.forEach((token, i) => {
			expect(token.value).toEqual(String(i + 1));
		});
	}
});

test('Parser Combinators - complex combinations - should handle optional with fallback', () => {
	const tokens = createTokens('hello world');
	const result = C.seq(
		C.identifier(),
		C.optional(C.identifier()),
		C.optional(C.number())
	)(tokens);

	expect(result.success).toEqual(true);
	if (result.success) {
		expect(result.value.length).toEqual(3);
		expect(result.value[0].value).toEqual('hello');
		expect(result.value[1] !== null).toBeTruthy();
		expect(result.value[2]).toEqual(null);
	}
});

test('Parser Combinators - error handling - should provide meaningful error messages', () => {
	const tokens = createTokens('42');
	const result = C.token('STRING')(tokens);

	expect(result.success).toEqual(false);
	if (!result.success) {
		expect(result.error.includes('Expected STRING')).toBeTruthy();
		expect(result.error.includes('but got NUMBER')).toBeTruthy();
	}
});

test('Parser Combinators - error handling - should track position for error reporting', () => {
	const tokens = createTokens('hello world 42');
	const result = C.seq(
		C.identifier(),
		C.identifier(),
		C.string()
	)(tokens);

	expect(result.success).toEqual(false);
	if (!result.success) {
		expect(result.error.includes('Expected STRING')).toBeTruthy();
	}
});

