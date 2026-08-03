import type { Token, TokenType } from '../lexer/lexer';

export type ParseError = {
	success: false;
	error: string;
	position: number;
};

export type ParseSuccess<T> = {
	success: true;
	value: T;
	remaining: Token[];
};

export type ParseResult<T> = ParseSuccess<T> | ParseError;

export type Parser<T> = (tokens: Token[]) => ParseResult<T>;

// --- Packrat memoization ---
//
// `choice`/`many`/`sepBy`/`lazy` are ordinary backtracking combinators: an
// enclosing choice point or repetition loop that backtracks past an already-
// parsed subtree re-derives that subtree from scratch, with zero reuse. Cost
// multiplies (not adds) with each layer of enclosing backtracking structure —
// see docs/internal/adrs/adr_0006.md for the
// profiled mechanism. `memoize` caches a parser's result keyed by (this parser
// instance, position).
//
// Position is keyed by `tokens[0]` — the actual Token *object* at the front
// of the remaining slice — not by `tokens.length` or an external position
// counter. This was tried first with `tokens.length` plus a manual
// `resetParserMemo()` call at the top of `parse()`, but that broke: several
// tests (e.g. parser-annotations.test.ts) call productions like
// `parseTypeExpression` directly, bypassing `parse()`'s reset entirely, so
// unrelated type strings parsed later in the same test file collided on
// remaining-length with cached results from earlier ones — a real, caught
// instance of exactly the silent-wrong-AST failure mode this needed to avoid.
//
// Keying on the Token object itself fixes this structurally rather than by
// remembering every call site: the lexer allocates a fresh Token object per
// lexical token per `Lexer` run, so two Token objects are only ever
// reference-equal if they're literally the same token from the same lex —
// there is no way for two unrelated parses (or two positions within one
// parse) to collide. This also means no manual reset/invalidation is needed:
// a `WeakMap<Token, ParseResult<T>>` lets entries for a token stream be
// garbage-collected once nothing else references it, rather than requiring
// every possible entry point into the grammar to remember to clear a cache.
//
// The empty-remaining-tokens case (no `tokens[0]` to key on) is simply not
// cached — parsers on empty input are cheap regardless, and end-of-input is
// not where the profiled backtracking blowup happens.
const memoize = <T>(parser: Parser<T>): Parser<T> => {
	const cache = new WeakMap<Token, ParseResult<T>>();
	return (tokens: Token[]) => {
		if (tokens.length === 0) return parser(tokens);
		const key = tokens[0];
		const cached = cache.get(key);
		if (cached !== undefined) return cached;
		const result = parser(tokens);
		cache.set(key, result);
		return result;
	};
};

// Basic token matching
export const token = (type: TokenType, value?: string): Parser<Token> => {
	const expectedMsg = `Expected ${type}${value ? ` '${value}'` : ''}`;
	return (tokens: Token[]) => {
		if (tokens.length === 0) {
			return {
				success: false,
				error: `${expectedMsg}, but got end of input`,
				position: 0,
			};
		}

		const first = tokens[0];
		if (first.type === type && (value === undefined || first.value === value)) {
			return {
				success: true,
				value: first,
				remaining: tokens.slice(1),
			};
		}

		return {
			success: false,
			error: `${expectedMsg}, but got ${first.type} '${first.value}'`,
			position: first.location.start.line,
		};
	};
};

// Sequence of parsers
export const seq =
	<T extends any[]>(...parsers: { [K in keyof T]: Parser<T[K]> }): Parser<T> =>
	(tokens: Token[]) => {
		const results = new Array(parsers.length) as T; // Pre-allocate
		let remaining = tokens;

		for (let i = 0; i < parsers.length; i++) {
			const result = parsers[i](remaining);
			if (!result.success) return result;
			results[i] = result.value;
			remaining = result.remaining;
		}

		return { success: true, value: results, remaining };
	};

// Choice between parsers (try each until one succeeds)
export const choice = <T>(...parsers: Parser<T>[]): Parser<T> =>
	memoize((tokens: Token[]) => {
		let lastError: string = '';
		let lastPosition: number = 0;

		for (const parser of parsers) {
			const result = parser(tokens);
			if (result.success) {
				return result;
			}
			// Keep track of the error from the parser that got furthest
			if (result.position > lastPosition) {
				lastError = result.error;
				lastPosition = result.position;
			}
		}

		return {
			success: false,
			error: lastError,
			position: lastPosition,
		};
	});

// For common 2-parser case
export const choice2 = <T>(p1: Parser<T>, p2: Parser<T>): Parser<T> =>
	memoize((tokens: Token[]) => {
		const result1 = p1(tokens);
		if (result1.success) return result1;

		const result2 = p2(tokens);
		if (result2.success) return result2;

		return result2.position > result1.position ? result2 : result1;
	});

// For common 3-parser case
export const choice3 = <T>(
	p1: Parser<T>,
	p2: Parser<T>,
	p3: Parser<T>
): Parser<T> =>
	memoize((tokens: Token[]) => {
		const result1 = p1(tokens);
		if (result1.success) return result1;

		const result2 = p2(tokens);
		if (result2.success) return result2;

		const result3 = p3(tokens);
		if (result3.success) return result3;

		// Return best error
		if (
			result3.position > result2.position &&
			result3.position > result1.position
		)
			return result3;
		if (result2.position > result1.position) return result2;
		return result1;
	});

// Zero or more repetitions
export const many = <T>(parser: Parser<T>): Parser<T[]> =>
	memoize((tokens: Token[]) => {
		const results: T[] = [];
		let remaining = tokens;

		while (remaining.length > 0) {
			const result = parser(remaining);
			if (!result.success) {
				break;
			}
			results.push(result.value);
			remaining = result.remaining;
		}

		return {
			success: true,
			value: results,
			remaining,
		};
	});

// One or more repetitions
export const many1 = <T>(parser: Parser<T>): Parser<T[]> => {
	const manyParser = many(parser); // built once per call site, not per invocation
	return memoize((tokens: Token[]) => {
		const manyResult = manyParser(tokens);
		if (!manyResult.success || manyResult.value.length === 0) {
			return {
				success: false,
				error: 'Expected at least one occurrence',
				position: tokens[0]?.location.start.line || 0,
			};
		}
		return manyResult;
	});
};

// Optional parser (zero or one)
export const optional =
	<T>(parser: Parser<T>): Parser<T | null> =>
	(tokens: Token[]) => {
		const result = parser(tokens);
		return result.success
			? result
			: {
					success: true,
					value: null,
					remaining: tokens,
				};
	};

// Transform parse result
export const map =
	<T, U>(parser: Parser<T>, fn: (value: T) => U): Parser<U> =>
	(tokens: Token[]) => {
		const result = parser(tokens);
		return result.success
			? {
					success: true,
					value: fn(result.value),
					remaining: result.remaining,
				}
			: result;
	};

// Lazy parser for recursive grammars
export const lazy = <T>(parserFn: () => Parser<T>): Parser<T> =>
	memoize((tokens: Token[]) => parserFn()(tokens));

// Separated by something
export const sepBy = <T, S>(
	parser: Parser<T>,
	separator: Parser<S>
): Parser<T[]> =>
	memoize((tokens: Token[]) => {
		// Parse first element
		const firstResult = parser(tokens);
		if (!firstResult.success) {
			return {
				success: true,
				value: [],
				remaining: tokens,
			};
		}

		const results: T[] = [firstResult.value];
		let remaining = firstResult.remaining;
		// Parse subsequent elements separated by separator
		while (remaining.length > 0) {
			const sepResult = separator(remaining);
			if (!sepResult.success) {
				break;
			}

			const elemResult = parser(sepResult.remaining);
			if (!elemResult.success) {
				break;
			}

			results.push(elemResult.value);
			remaining = elemResult.remaining;
		}

		return {
			success: true,
			value: results,
			remaining,
		};
	});

// Parse until end of input
export const parseAll =
	<T>(parser: Parser<T>): Parser<T> =>
	(tokens: Token[]) => {
		const result = parser(tokens);
		if (!result.success || !result.remaining.length) {
			return result;
		}

		const unexpected = result.remaining[0];
		return {
			success: false,
			error: `Unexpected ${unexpected.type} '${unexpected.value}' at end of input`,
			position: unexpected.location.start.line,
		};
	};

// Convenience parsers for common token types
export const identifier = (): Parser<Token> => token('IDENTIFIER');
export const number = (): Parser<Token> => token('NUMBER');
export const string = (): Parser<Token> => token('STRING');
export const keyword = (value: string): Parser<Token> =>
	token('KEYWORD', value);
export const operator = (value: string): Parser<Token> =>
	token('OPERATOR', value);
export const punctuation = (value: string): Parser<Token> =>
	token('PUNCTUATION', value);
export const accessor = (): Parser<Token> => token('ACCESSOR');
