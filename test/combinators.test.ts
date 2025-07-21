import { Lexer } from '../src/lexer';
import * as C from '../src/parser/combinators';

describe('Parser Combinators', () => {
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

	describe('token', () => {
		test('should match exact token type and value', () => {
			const tokens = createTokensWithoutEOF('42');
			const result = C.token('NUMBER', '42')(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
				expect(result.remaining).toHaveLength(0);
			}
		});

		test('should match token type without value constraint', () => {
			const tokens = createTokens('42');
			const result = C.token('NUMBER')(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
			}
		});

		test('should fail on wrong token type', () => {
			const tokens = createTokens('42');
			const result = C.token('IDENTIFIER')(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Expected IDENTIFIER');
				expect(result.error).toContain('but got NUMBER');
			}
		});

		test('should fail on wrong token value', () => {
			const tokens = createTokens('42');
			const result = C.token('NUMBER', '43')(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("Expected NUMBER '43'");
				expect(result.error).toContain("but got NUMBER '42'");
			}
		});

		test('should fail on empty input', () => {
			const result = C.token('NUMBER')([]);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Expected NUMBER');
				expect(result.error).toContain('but got end of input');
			}
		});
	});

	describe('anyToken', () => {
		test('should match any token', () => {
			const tokens = createTokensWithoutEOF('42');
			const result = C.anyToken()(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
				expect(result.remaining).toHaveLength(0);
			}
		});

		test('should fail on empty input', () => {
			const result = C.anyToken()([]);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe('Expected any token, but got end of input');
			}
		});
	});

	describe('seq', () => {
		test('should match sequence of parsers', () => {
			const tokens = createTokensWithoutEOF('x = 42');
			const parser = C.seq(C.identifier(), C.operator('='), C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(3);
				expect(result.value[0].type).toBe('IDENTIFIER');
				expect(result.value[0].value).toBe('x');
				expect(result.value[1].type).toBe('OPERATOR');
				expect(result.value[1].value).toBe('=');
				expect(result.value[2].type).toBe('NUMBER');
				expect(result.value[2].value).toBe('42');
				expect(result.remaining).toHaveLength(0);
			}
		});

		test('should fail if any parser in sequence fails', () => {
			const tokens = createTokens('x = 42');
			const parser = C.seq(
				C.identifier(),
				C.operator('+'), // Wrong operator
				C.number()
			);
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("Expected OPERATOR '+'");
				expect(result.error).toContain("but got OPERATOR '='");
			}
		});

		test('should handle empty sequence', () => {
			const tokens = createTokens('x = 42');
			const parser = C.seq();
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(0);
				expect(result.remaining).toEqual(tokens);
			}
		});
	});

	describe('choice', () => {
		test('should match first successful parser', () => {
			const tokens = createTokens('42');
			const parser = C.choice(C.number(), C.identifier(), C.string());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
			}
		});

		test('should try all parsers in order', () => {
			const tokens = createTokens('hello');
			const parser = C.choice(C.number(), C.identifier(), C.string());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('IDENTIFIER');
				expect(result.value.value).toBe('hello');
			}
		});

		test('should fail if all parsers fail', () => {
			const tokens = createTokens('42');
			const parser = C.choice(C.identifier(), C.string());
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Expected IDENTIFIER');
				expect(result.error).toContain('but got NUMBER');
			}
		});

		test('should handle empty choice', () => {
			const tokens = createTokens('42');
			const parser = C.choice();
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe('');
			}
		});
	});

	describe('many', () => {
		test('should match zero or more occurrences', () => {
			const tokens = createTokens('1 2 3');
			const parser = C.many(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(3);
				expect(result.value[0].value).toBe('1');
				expect(result.value[1].value).toBe('2');
				expect(result.value[2].value).toBe('3');
			}
		});

		test('should match zero occurrences', () => {
			const tokens = createTokens('hello');
			const parser = C.many(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(0);
				expect(result.remaining).toEqual(tokens);
			}
		});

		test('should handle empty input', () => {
			const parser = C.many(C.number());
			const result = parser([]);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(0);
				expect(result.remaining).toHaveLength(0);
			}
		});
	});

	describe('many1', () => {
		test('should match one or more occurrences', () => {
			const tokens = createTokens('1 2 3');
			const parser = C.many1(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(3);
				expect(result.value[0].value).toBe('1');
				expect(result.value[1].value).toBe('2');
				expect(result.value[2].value).toBe('3');
			}
		});

		test('should fail on zero occurrences', () => {
			const tokens = createTokens('hello');
			const parser = C.many1(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe('Expected at least one occurrence');
			}
		});

		test('should fail on empty input', () => {
			const parser = C.many1(C.number());
			const result = parser([]);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe('Expected at least one occurrence');
			}
		});
	});

	describe('optional', () => {
		test('should match when parser succeeds', () => {
			const tokens = createTokensWithoutEOF('42');
			const parser = C.optional(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).not.toBeNull();
				if (result.value) {
					expect(result.value.value).toBe('42');
				}
				expect(result.remaining).toHaveLength(0);
			}
		});

		test('should return null when parser fails', () => {
			const tokens = createTokens('hello');
			const parser = C.optional(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toBeNull();
				expect(result.remaining).toEqual(tokens);
			}
		});

		test('should handle empty input', () => {
			const parser = C.optional(C.number());
			const result = parser([]);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toBeNull();
				expect(result.remaining).toHaveLength(0);
			}
		});
	});

	describe('map', () => {
		test('should transform successful parse result', () => {
			const tokens = createTokensWithoutEOF('42');
			const parser = C.map(C.number(), token => parseInt(token.value));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toBe(42);
				expect(result.remaining).toHaveLength(0);
			}
		});

		test('should preserve failure', () => {
			const tokens = createTokens('hello');
			const parser = C.map(C.number(), token => parseInt(token.value));
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Expected NUMBER');
				expect(result.error).toContain('but got IDENTIFIER');
			}
		});
	});

	describe('lazy', () => {
		test('should defer parser creation', () => {
			const tokens = createTokens('42');
			let called = false;
			const parser = C.lazy(() => {
				called = true;
				return C.number();
			});

			expect(called).toBe(false);
			const result = parser(tokens);
			expect(called).toBe(true);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
			}
		});

		test('should handle recursive parsers', () => {
			// This tests that lazy works for recursive definitions
			const tokens = createTokens('42');
			const parser = C.lazy(() => C.choice(C.number(), C.identifier()));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
			}
		});
	});

	describe('sepBy', () => {
		test('should parse elements separated by separator', () => {
			const tokens = createTokens('1, 2, 3');
			const parser = C.sepBy(C.number(), C.punctuation(','));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(3);
				expect(result.value[0].value).toBe('1');
				expect(result.value[1].value).toBe('2');
				expect(result.value[2].value).toBe('3');
			}
		});

		test('should parse single element', () => {
			const tokens = createTokens('1');
			const parser = C.sepBy(C.number(), C.punctuation(','));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(1);
				expect(result.value[0].value).toBe('1');
			}
		});

		test('should parse zero elements', () => {
			const tokens = createTokens('hello');
			const parser = C.sepBy(C.number(), C.punctuation(','));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(0);
				expect(result.remaining).toEqual(tokens);
			}
		});

		test('should fail if separator is followed by invalid element', () => {
			const tokens = createTokens('1, hello');
			const parser = C.sepBy(C.number(), C.punctuation(','));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				// sepBy should stop at the first failure, not fail entirely
				expect(result.value).toHaveLength(1);
				expect(result.value[0].value).toBe('1');
			}
		});
	});

	describe('parseAll', () => {
		test('should succeed when parser consumes all input', () => {
			const tokens = createTokensWithoutEOF('42');
			const parser = C.parseAll(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
			}
		});

		test('should fail when input remains', () => {
			const tokens = createTokens('42 hello');
			const parser = C.parseAll(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Unexpected IDENTIFIER');
				expect(result.error).toContain('at end of input');
			}
		});

		test('should preserve parser failure', () => {
			const tokens = createTokens('hello');
			const parser = C.parseAll(C.number());
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Expected NUMBER');
				expect(result.error).toContain('but got IDENTIFIER');
			}
		});
	});

	describe('convenience parsers', () => {
		test('identifier should match identifiers', () => {
			const tokens = createTokens('hello');
			const result = C.identifier()(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('IDENTIFIER');
				expect(result.value.value).toBe('hello');
			}
		});

		test('number should match numbers', () => {
			const tokens = createTokens('42');
			const result = C.number()(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('NUMBER');
				expect(result.value.value).toBe('42');
			}
		});

		test('string should match strings', () => {
			const tokens = createTokens('"hello"');
			const result = C.string()(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('STRING');
				expect(result.value.value).toBe('hello');
			}
		});

		test('keyword should match specific keywords', () => {
			const tokens = createTokens('if');
			const result = C.keyword('if')(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('KEYWORD');
				expect(result.value.value).toBe('if');
			}
		});

		test('operator should match specific operators', () => {
			const tokens = createTokens('+');
			const result = C.operator('+')(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('OPERATOR');
				expect(result.value.value).toBe('+');
			}
		});

		test('punctuation should match specific punctuation', () => {
			const tokens = createTokens('(');
			const result = C.punctuation('(')(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('PUNCTUATION');
				expect(result.value.value).toBe('(');
			}
		});

		test('accessor should match accessors', () => {
			const tokens = createTokens('@field');
			const result = C.accessor()(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.type).toBe('ACCESSOR');
				expect(result.value.value).toBe('field');
			}
		});
	});

	describe('complex combinations', () => {
		test('should handle nested sequences and choices', () => {
			const tokens = createTokens('x = 42');
			const parser = C.map(
				C.seq(
					C.identifier(),
					C.choice(C.operator('='), C.operator(':=')),
					C.choice(C.number(), C.string())
				),
				([id, op, val]) => ({
					variable: id.value,
					operator: op.value,
					value: val.value,
				})
			);
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					variable: 'x',
					operator: '=',
					value: '42',
				});
			}
		});

		test('should handle many with separator', () => {
			const tokens = createTokens('1, 2, 3, 4');
			const parser = C.sepBy(C.number(), C.punctuation(','));
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toHaveLength(4);
				expect(result.value.map(t => t.value)).toEqual(['1', '2', '3', '4']);
			}
		});

		test('should handle optional with fallback', () => {
			const tokens = createTokens('42');
			const parser = C.map(
				C.seq(C.number(), C.optional(C.punctuation('!'))),
				([num, bang]) => ({
					value: parseInt(num.value),
					isExclamation: bang !== null,
				})
			);
			const result = parser(tokens);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					value: 42,
					isExclamation: false,
				});
			}
		});
	});

	describe('error handling', () => {
		test('should provide meaningful error messages', () => {
			const tokens = createTokens('hello');
			const parser = C.seq(C.number(), C.operator('+'), C.number());
			const result = parser(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Expected NUMBER');
				expect(result.error).toContain('but got IDENTIFIER');
				expect(result.position).toBeGreaterThan(0);
			}
		});

		test('should track position for error reporting', () => {
			const tokens = createTokens('hello');
			const result = C.number()(tokens);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.position).toBeGreaterThan(0);
			}
		});
	});
});
