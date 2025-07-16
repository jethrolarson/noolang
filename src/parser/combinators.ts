import { Token, TokenType } from "../lexer";

export type ParseResult<T> =
  | {
      success: true;
      value: T;
      remaining: Token[];
    }
  | {
      success: false;
      error: string;
      position: number;
    };

export type Parser<T> = (tokens: Token[]) => ParseResult<T>;

// Basic token matching
export const token =
  (type: TokenType, value?: string): Parser<Token> =>
  (tokens: Token[]) => {
    if (tokens.length === 0) {
      return {
        success: false,
        error: `Expected ${type}${
          value ? ` '${value}'` : ""
        }, but got end of input`,
        position: 0,
      };
    }

    const [first, ...rest] = tokens;
    if (first.type === type && (value === undefined || first.value === value)) {
      return {
        success: true,
        value: first,
        remaining: rest,
      };
    }

    return {
      success: false,
      error: `Expected ${type}${value ? ` '${value}'` : ""}, but got ${
        first.type
      } '${first.value}'`,
      position: first.location.start.line,
    };
  };

// Match any token
export const anyToken = (): Parser<Token> => (tokens: Token[]) => {
  if (tokens.length === 0) {
    return {
      success: false,
      error: "Expected any token, but got end of input",
      position: 0,
    };
  }

  const [first, ...rest] = tokens;
  return {
    success: true,
    value: first,
    remaining: rest,
  };
};

// Sequence of parsers
export const seq =
  <T extends any[]>(...parsers: { [K in keyof T]: Parser<T[K]> }): Parser<T> =>
  (tokens: Token[]) => {
    const results: T[] = [];
    let remaining = tokens;

    for (const parser of parsers) {
      const result = parser(remaining);
      if (!result.success) {
        return result;
      }
      results.push(result.value);
      remaining = result.remaining;
    }

    return {
      success: true,
      value: results as T,
      remaining,
    };
  };

// Choice between parsers (try each until one succeeds)
export const choice =
  <T>(...parsers: Parser<T>[]): Parser<T> =>
  (tokens: Token[]) => {
    let lastError: string = "";
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
  };

// Zero or more repetitions
export const many =
  <T>(parser: Parser<T>): Parser<T[]> =>
  (tokens: Token[]) => {
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
  };

// One or more repetitions
export const many1 =
  <T>(parser: Parser<T>): Parser<T[]> =>
  (tokens: Token[]) => {
    const manyResult = many(parser)(tokens);
    if (!manyResult.success || manyResult.value.length === 0) {
      return {
        success: false,
        error: "Expected at least one occurrence",
        position: tokens[0]?.location.start.line || 0,
      };
    }
    return manyResult;
  };

// Optional parser (zero or one)
export const optional =
  <T>(parser: Parser<T>): Parser<T | null> =>
  (tokens: Token[]) => {
    const result = parser(tokens);
    if (result.success) {
      return result;
    }
    return {
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
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      value: fn(result.value),
      remaining: result.remaining,
    };
  };

// Lazy parser for recursive grammars
export const lazy =
  <T>(parserFn: () => Parser<T>): Parser<T> =>
  (tokens: Token[]) =>
    parserFn()(tokens);

// Separated by something
export const sepBy = <T, S>(
  parser: Parser<T>,
  separator: Parser<S>,
): Parser<T[]> => {
  return (tokens: Token[]) => {
    const results: T[] = [];
    let remaining = tokens;

    // Parse first element
    const firstResult = parser(remaining);
    if (!firstResult.success) {
      return {
        success: true,
        value: [],
        remaining,
      };
    }

    results.push(firstResult.value);
    remaining = firstResult.remaining;

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
  };
};

// Parse until end of input
export const parseAll =
  <T>(parser: Parser<T>): Parser<T> =>
  (tokens: Token[]) => {
    const result = parser(tokens);
    if (!result.success) {
      return result;
    }

    if (result.remaining.length > 0) {
      const unexpected = result.remaining[0];
      return {
        success: false,
        error: `Unexpected ${unexpected.type} '${unexpected.value}' at end of input`,
        position: unexpected.location.start.line,
      };
    }

    return result;
  };

// Convenience parsers for common token types
export const identifier = (): Parser<Token> => token("IDENTIFIER");
export const number = (): Parser<Token> => token("NUMBER");
export const string = (): Parser<Token> => token("STRING");
export const keyword = (value: string): Parser<Token> =>
  token("KEYWORD", value);
export const operator = (value: string): Parser<Token> =>
  token("OPERATOR", value);
export const punctuation = (value: string): Parser<Token> =>
  token("PUNCTUATION", value);
export const accessor = (): Parser<Token> => token("ACCESSOR");
