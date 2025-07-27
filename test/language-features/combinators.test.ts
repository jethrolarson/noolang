import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../src/lexer/lexer';
import * as C from '../../src/parser/combinators';

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

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'NUMBER');
		assert.equal(result.value.value, '42');
		assert.equal(result.remaining.length, 0);
	}
});

test('Parser Combinators - token - should match token type without value constraint', () => {
	const tokens = createTokens('42');
	const result = C.token('NUMBER')(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'NUMBER');
		assert.equal(result.value.value, '42');
	}
});

test('Parser Combinators - token - should fail on wrong token type', () => {
	const tokens = createTokens('42');
	const result = C.token('IDENTIFIER')(tokens);

	assert.equal(result.success, false);
	if (!result.success) {
		assert.ok(result.error.includes('Expected IDENTIFIER'));
		assert.ok(result.error.includes('but got NUMBER'));
	}
});

test('Parser Combinators - token - should fail on wrong token value', () => {
	const tokens = createTokens('42');
	const result = C.token('NUMBER', '43')(tokens);

	assert.equal(result.success, false);
	if (!result.success) {
		assert.ok(result.error.includes("Expected NUMBER '43'"));
		assert.ok(result.error.includes("but got NUMBER '42'"));
	}
});

test('Parser Combinators - token - should fail on empty input', () => {
	const result = C.token('NUMBER')([]);

	assert.equal(result.success, false);
	if (!result.success) {
		assert.ok(result.error.includes('Expected NUMBER'));
		assert.ok(result.error.includes('but got end of input'));
	}
});

test('Parser Combinators - anyToken - should match any token', () => {
	const tokens = createTokensWithoutEOF('42');
	const result = C.anyToken()(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'NUMBER');
		assert.equal(result.value.value, '42');
		assert.equal(result.remaining.length, 0);
	}
});

test('Parser Combinators - anyToken - should fail on empty input', () => {
	const result = C.anyToken()([]);

	assert.equal(result.success, false);
	if (!result.success) {
		assert.equal(result.error, 'Expected any token, but got end of input');
	}
});

test('Parser Combinators - seq - should match sequence of parsers', () => {
	const tokens = createTokens('hello world');
	const result = C.seq(
		C.token('IDENTIFIER', 'hello'),
		C.token('IDENTIFIER', 'world')
	)(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 2);
		assert.equal(result.value[0].value, 'hello');
		assert.equal(result.value[1].value, 'world');
	}
});

test('Parser Combinators - seq - should fail if any parser in sequence fails', () => {
	const tokens = createTokens('hello 42');
	const result = C.seq(
		C.token('IDENTIFIER', 'hello'),
		C.token('IDENTIFIER', 'world')
	)(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - seq - should handle empty sequence', () => {
	const tokens = createTokens('hello');
	const result = C.seq()(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 0);
		assert.equal(result.remaining, tokens);
	}
});

test('Parser Combinators - choice - should match first successful parser', () => {
	const tokens = createTokens('42');
	const result = C.choice(
		C.token('IDENTIFIER'),
		C.token('NUMBER'),
		C.token('STRING')
	)(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'NUMBER');
		assert.equal(result.value.value, '42');
	}
});

test('Parser Combinators - choice - should try all parsers in order', () => {
	const tokens = createTokens('hello');
	const result = C.choice(
		C.token('NUMBER'),
		C.token('STRING'),
		C.token('IDENTIFIER')
	)(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'IDENTIFIER');
		assert.equal(result.value.value, 'hello');
	}
});

test('Parser Combinators - choice - should fail if all parsers fail', () => {
	const tokens = createTokens('42');
	const result = C.choice(
		C.token('IDENTIFIER'),
		C.token('STRING'),
		C.token('PUNCTUATION')
	)(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - choice - should handle empty choice', () => {
	const tokens = createTokens('hello');
	const result = C.choice()(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - many - should match zero or more occurrences', () => {
	const tokens = createTokens('42 43 44');
	const result = C.many(C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 3);
		assert.equal(result.value[0].value, '42');
		assert.equal(result.value[1].value, '43');
		assert.equal(result.value[2].value, '44');
	}
});

test('Parser Combinators - many - should match zero occurrences', () => {
	const tokens = createTokens('hello');
	const result = C.many(C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 0);
		assert.equal(result.remaining, tokens);
	}
});

test('Parser Combinators - many - should handle empty input', () => {
	const result = C.many(C.token('NUMBER'))([]);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 0);
	}
});

test('Parser Combinators - many1 - should match one or more occurrences', () => {
	const tokens = createTokens('42 43');
	const result = C.many1(C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 2);
		assert.equal(result.value[0].value, '42');
		assert.equal(result.value[1].value, '43');
	}
});

test('Parser Combinators - many1 - should fail on zero occurrences', () => {
	const tokens = createTokens('hello');
	const result = C.many1(C.token('NUMBER'))(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - many1 - should fail on empty input', () => {
	const result = C.many1(C.token('NUMBER'))([]);

	assert.equal(result.success, false);
});

test('Parser Combinators - optional - should match when parser succeeds', () => {
	const tokens = createTokens('42');
	const result = C.optional(C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.ok(result.value !== null);
		if (result.value !== null) {
			assert.equal(result.value.value, '42');
		}
	}
});

test('Parser Combinators - optional - should return null when parser fails', () => {
	const tokens = createTokens('hello');
	const result = C.optional(C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value, null);
		assert.equal(result.remaining, tokens);
	}
});

test('Parser Combinators - optional - should handle empty input', () => {
	const result = C.optional(C.token('NUMBER'))([]);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value, null);
	}
});

test('Parser Combinators - map - should transform successful parse result', () => {
	const tokens = createTokens('42');
	const result = C.map(C.token('NUMBER'), (token) => parseInt(token.value))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value, 42);
	}
});

test('Parser Combinators - map - should preserve failure', () => {
	const tokens = createTokens('hello');
	const result = C.map(C.token('NUMBER'), (token) => parseInt(token.value))(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - lazy - should defer parser creation', () => {
	const tokens = createTokens('42');
	const result = C.lazy(() => C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.value, '42');
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
	assert.equal(result.success, true);
});

test('Parser Combinators - sepBy - should parse elements separated by separator', () => {
	const tokens = createTokens('42, 43, 44');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 3);
		assert.equal(result.value[0].value, '42');
		assert.equal(result.value[1].value, '43');
		assert.equal(result.value[2].value, '44');
	}
});

test('Parser Combinators - sepBy - should parse single element', () => {
	const tokens = createTokens('42');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 1);
		assert.equal(result.value[0].value, '42');
	}
});

test('Parser Combinators - sepBy - should parse zero elements', () => {
	const tokens = createTokens('hello');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 0);
	}
});

test('Parser Combinators - sepBy - should fail if separator is followed by invalid element', () => {
	const tokens = createTokens('42, hello');
	const result = C.sepBy(C.token('NUMBER'), C.token('PUNCTUATION', ','))(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - parseAll - should succeed when parser consumes all input', () => {
	const tokens = createTokens('42');
	const result = C.parseAll(C.token('NUMBER'))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.value, '42');
	}
});

test('Parser Combinators - parseAll - should fail when input remains', () => {
	const tokens = createTokens('42 hello');
	const result = C.parseAll(C.token('NUMBER'))(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - parseAll - should preserve parser failure', () => {
	const tokens = createTokens('hello');
	const result = C.parseAll(C.token('NUMBER'))(tokens);

	assert.equal(result.success, false);
});

test('Parser Combinators - convenience parsers - identifier should match identifiers', () => {
	const tokens = createTokens('hello');
	const result = C.identifier()(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'IDENTIFIER');
		assert.equal(result.value.value, 'hello');
	}
});

test('Parser Combinators - convenience parsers - number should match numbers', () => {
	const tokens = createTokens('42');
	const result = C.number()(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'NUMBER');
		assert.equal(result.value.value, '42');
	}
});

test('Parser Combinators - convenience parsers - string should match strings', () => {
	const tokens = createTokens('"hello"');
	const result = C.string()(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'STRING');
		assert.equal(result.value.value, '"hello"');
	}
});

test('Parser Combinators - convenience parsers - keyword should match specific keywords', () => {
	const tokens = createTokens('if');
	const result = C.keyword('if')(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'KEYWORD');
		assert.equal(result.value.value, 'if');
	}
});

test('Parser Combinators - convenience parsers - operator should match specific operators', () => {
	const tokens = createTokens('+');
	const result = C.operator('+')(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'OPERATOR');
		assert.equal(result.value.value, '+');
	}
});

test('Parser Combinators - convenience parsers - punctuation should match specific punctuation', () => {
	const tokens = createTokens('(');
	const result = C.punctuation('(')(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'PUNCTUATION');
		assert.equal(result.value.value, '(');
	}
});

test('Parser Combinators - convenience parsers - accessor should match accessors', () => {
	const tokens = createTokens('@name');
	const result = C.accessor()(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.type, 'ACCESSOR');
		assert.equal(result.value.value, '@name');
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

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 6);
		assert.equal(result.value[0].value, 'if');
		assert.equal(result.value[1].value, '42');
		assert.equal(result.value[3].value, 'hello');
		assert.equal(result.value[5].value, 'world');
	}
});

test('Parser Combinators - complex combinations - should handle many with separator', () => {
	const tokens = createTokens('1, 2, 3, 4');
	const result = C.sepBy(C.number(), C.punctuation(','))(tokens);

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 4);
		result.value.forEach((token, i) => {
			assert.equal(token.value, String(i + 1));
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

	assert.equal(result.success, true);
	if (result.success) {
		assert.equal(result.value.length, 3);
		assert.equal(result.value[0].value, 'hello');
		assert.ok(result.value[1] !== null);
		assert.equal(result.value[2], null);
	}
});

test('Parser Combinators - error handling - should provide meaningful error messages', () => {
	const tokens = createTokens('42');
	const result = C.token('STRING')(tokens);

	assert.equal(result.success, false);
	if (!result.success) {
		assert.ok(result.error.includes('Expected STRING'));
		assert.ok(result.error.includes('but got NUMBER'));
	}
});

test('Parser Combinators - error handling - should track position for error reporting', () => {
	const tokens = createTokens('hello world 42');
	const result = C.seq(
		C.identifier(),
		C.identifier(),
		C.string()
	)(tokens);

	assert.equal(result.success, false);
	if (!result.success) {
		assert.ok(result.error.includes('Expected STRING'));
	}
});

test.run();
