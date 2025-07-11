import { Token } from '../lexer';
import {
  Expression,
  Program,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  ApplicationExpression,
  PipelineExpression,
  BinaryExpression,
  IfExpression,
  TopLevel,
  createLocation,
  DefinitionExpression,
  ImportExpression,
  RecordExpression,
  AccessorExpression
} from '../ast';
import * as C from './combinators';

// --- Basic Parsers ---
const parseIdentifier = C.map(C.identifier(), (token): VariableExpression => ({
  kind: 'variable',
  name: token.value,
  location: token.location
}));

const parseNumber = C.map(C.number(), (token): LiteralExpression => ({
  kind: 'literal',
  value: parseFloat(token.value),
  location: token.location
}));

const parseString = C.map(C.string(), (token): LiteralExpression => ({
  kind: 'literal',
  value: token.value,
  location: token.location
}));

const parseBoolean = C.map(C.choice(C.keyword('true'), C.keyword('false')), (token): LiteralExpression => ({
  kind: 'literal',
  value: token.value === 'true',
  location: token.location
}));

const parseAccessor = C.map(C.accessor(), (token): AccessorExpression => ({
  kind: 'accessor',
  field: token.value,
  location: token.location
}));

// --- Record Parsing ---
const parseRecordFieldName = C.map(
  C.accessor(),
  (token) => token.value // Just get the field name without @
);



// Parse an expression that stops at @ (accessor tokens) or semicolon
const parseRecordFieldValue = (tokens: Token[]): C.ParseResult<Expression> => {
  let currentTokens = tokens;
  let expressionTokens: Token[] = [];
  
  while (currentTokens.length > 0) {
    const token = currentTokens[0];
    // Stop if we encounter an accessor (@) - that's the start of the next field
    if (token.type === 'ACCESSOR') {
      break;
    }
    // Stop if we encounter closing brace
    if (token.type === 'PUNCTUATION' && token.value === '}') {
      break;
    }
    // Stop if we encounter semicolon
    if (token.type === 'PUNCTUATION' && token.value === ';') {
      break;
    }
    
    expressionTokens.push(token);
    currentTokens = currentTokens.slice(1);
  }
  
  if (expressionTokens.length === 0) {
    return {
      success: false,
      error: 'Expected expression for record field value',
      position: tokens[0]?.location.start.line || 0
    };
  }
  
  // Parse the collected tokens as a full expression
  const result = parseComparison(expressionTokens);
  if (!result.success) {
    return result;
  }
  
  return {
    success: true,
    value: result.value,
    remaining: currentTokens
  };
};

const parseRecordField = C.map(
  C.seq(
    parseRecordFieldName,
    parseRecordFieldValue
  ),
  ([fieldName, value]) => ({
    name: fieldName,
    value
  })
);

// Custom parser for a sequence of fields separated by semicolons
const parseRecordFields: C.Parser<{ name: string; value: Expression }[]> = (tokens) => {
  let fields: { name: string; value: Expression }[] = [];
  let rest = tokens;
  
  // Parse first field
  const firstFieldResult = parseRecordField(rest);
  if (!firstFieldResult.success) {
    return {
      success: false,
      error: 'Expected at least one record field',
      position: tokens[0]?.location.start.line || 0
    };
  }
  fields.push(firstFieldResult.value);
  rest = firstFieldResult.remaining;
  
  // Parse additional fields, each preceded by a semicolon
  while (rest.length > 0) {
    const semiResult = C.punctuation(';')(rest);
    if (!semiResult.success) {
      break; // No more semicolons, we're done
    }
    rest = semiResult.remaining;
    
    const fieldResult = parseRecordField(rest);
    if (!fieldResult.success) {
      return {
        success: false,
        error: 'Expected field after semicolon',
        position: rest[0]?.location.start.line || 0
      };
    }
    fields.push(fieldResult.value);
    rest = fieldResult.remaining;
  }
  
  return {
    success: true,
    value: fields,
    remaining: rest
  };
};

const parseRecord = C.map(
  C.seq(
    C.punctuation('{'),
    C.optional(parseRecordFields),
    C.punctuation('}')
  ),
  ([open, fields, close]): RecordExpression => {
    const fieldsList = fields || [];
    return {
      kind: 'record',
      fields: fieldsList,
      location: open.location
    };
  }
);

// --- Parenthesized Expressions ---
const parseParenExpr: C.Parser<Expression> = C.map(
  C.seq(
    C.punctuation('('),
    C.lazy(() => parseExpr), // Use lazy evaluation to handle circular dependency
    C.punctuation(')')
  ),
  ([open, expr, close]) => expr
);



// --- Lambda Expression ---
const parseLambdaExpression: C.Parser<FunctionExpression> = C.map(
  C.seq(
    C.keyword('fn'),
    C.many(C.identifier()), // Support multiple parameters
    C.operator('=>'),
    C.lazy(() => parseThrush) // Allow full expressions as function bodies
  ),
  ([fn, params, _arrow, body]): FunctionExpression => ({
    kind: 'function',
    params: params.map(p => p.value),
    body,
    location: fn.location
  })
);

// --- List Parsing ---
// Custom parser for a sequence of expressions separated by semicolons
const parseListElements: C.Parser<Expression[]> = (tokens) => {
  let elements: Expression[] = [];
  let rest = tokens;
  
  // Parse first element
  const firstElementResult = C.lazy(() => parseThrush)(rest);
  if (!firstElementResult.success) {
    return {
      success: false,
      error: 'Expected at least one list element',
      position: tokens[0]?.location.start.line || 0
    };
  }
  elements.push(firstElementResult.value);
  rest = firstElementResult.remaining;
  
  // Parse additional elements, each preceded by a semicolon
  while (rest.length > 0) {
    const semiResult = C.punctuation(';')(rest);
    if (!semiResult.success) {
      break; // No more semicolons, we're done
    }
    rest = semiResult.remaining;
    
    const elementResult = C.lazy(() => parseThrush)(rest);
    if (!elementResult.success) {
      return {
        success: false,
        error: 'Expected element after semicolon',
        position: rest[0]?.location.start.line || 0
      };
    }
    elements.push(elementResult.value);
    rest = elementResult.remaining;
  }
  
  return {
    success: true,
    value: elements,
    remaining: rest
  };
};

const parseList: C.Parser<LiteralExpression> = C.map(
  C.seq(
    C.punctuation('['),
    C.optional(parseListElements),
    C.punctuation(']')
  ),
  ([open, elements, close]) => {
    const elementsList: Expression[] = elements || [];
    return {
      kind: 'literal',
      value: elementsList,
      location: open.location
    };
  }
);

// Add parseList to parsePrimary after it's defined
const parsePrimaryWithList: C.Parser<Expression> = C.choice(
  parseNumber,
  parseString,
  parseBoolean,
  parseIdentifier,
  parseList,
  parseRecord,
  parseAccessor,
  parseParenExpr,
  parseLambdaExpression // <-- allow lambdas as arguments
);

// --- Simple Expression (no function applications) ---
const parseSimpleExpression: C.Parser<Expression> = C.map(
  C.seq(
    parsePrimaryWithList,
    C.many(
      C.seq(
        C.choice(
          C.operator('+'), C.operator('-'), C.operator('*'), C.operator('/'),
          C.operator('<'), C.operator('>'), C.operator('<='), C.operator('>='),
          C.operator('=='), C.operator('!=')
        ),
        parsePrimaryWithList
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: op.value as '+' | '-' | '*' | '/' | '<' | '>' | '<=' | '>=' | '==' | '!=',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);

// --- Definition ---
// Note: The right side of '=' in a definition can be any expression, including a sequence (e.g., foo = (1; 2)).
// However, 'foo = 1; 2' is parsed as two sequenced expressions: (foo = 1); 2.
// Use parentheses to assign the result of a sequence to a variable.
// This matches the semantics of expression-based languages like OCaml or Haskell.
const parseDefinition: C.Parser<DefinitionExpression> = C.map(
  C.seq(
    C.identifier(),
    C.operator('='),
    C.lazy(() => parseSequenceTermWithIf)
  ),
  ([name, equals, value]): DefinitionExpression => {
    return {
      kind: 'definition',
      name: name.value,
      value,
      location: name.location
    };
  }
);



// --- If Expression (special: do not allow semicolon in branches) ---
const parseIfExpression: C.Parser<Expression> = C.map(
  C.seq(
    C.keyword('if'),
    C.lazy(() => parseSequenceTerm),
    C.keyword('then'),
    C.lazy(() => parseSequenceTerm),
    C.keyword('else'),
    C.lazy(() => parseSequenceTerm)
  ),
  ([ifKw, condition, thenKw, thenExpr, elseKw, elseExpr]) => {
    return {
      kind: 'if',
      condition,
      then: thenExpr,
      else: elseExpr,
      location: ifKw.location
    };
  }
);

// --- Function Application (left-associative, tightest binding) ---
const parseApplication: C.Parser<Expression> = C.map(
  C.seq(
    parsePrimaryWithList,
    C.many(parsePrimaryWithList)
  ),
  ([func, args]) => {
    let result = func;
    for (const arg of args) {
      result = {
        kind: 'application',
        func: result,
        args: [arg],
        location: result.location
      };
    }
    return result;
  }
);

// --- Multiplicative (*, /) ---
const parseMultiplicative: C.Parser<Expression> = C.map(
  C.seq(
    parseApplication,
    C.many(
      C.seq(
        C.choice(C.operator('*'), C.operator('/')),
        parseApplication
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: op.value as '*' | '/',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);

// --- Additive (+, -) ---
const parseAdditive: C.Parser<Expression> = C.map(
  C.seq(
    parseMultiplicative,
    C.many(
      C.seq(
        C.choice(C.operator('+'), C.operator('-')),
        parseMultiplicative
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: op.value as '+' | '-',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);

// --- Comparison (<, >, <=, >=, ==, !=) ---
const parseComparison: C.Parser<Expression> = C.map(
  C.seq(
    parseAdditive,
    C.many(
      C.seq(
        C.choice(
          C.operator('<'), C.operator('>'), C.operator('<='), C.operator('>='),
          C.operator('=='), C.operator('!=')
        ),
        parseAdditive
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: op.value as '<' | '>' | '<=' | '>=' | '==' | '!=',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);



// --- Composition (|>, <|) ---
const parseCompose: C.Parser<Expression> = C.map(
  C.seq(
    parseComparison,
    C.many(
      C.seq(
        C.choice(C.operator('|>'), C.operator('<|')),
        parseComparison
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: op.value as '|>' | '<|',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);

// --- Thrush (|) ---
const parseThrush: C.Parser<Expression> = C.map(
  C.seq(
    parseCompose,
    C.many(
      C.seq(
        C.operator('|'),
        parseCompose
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: '|',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);

// --- Import Expression ---
const parseImportExpression: C.Parser<ImportExpression> = C.map(
  C.seq(
    C.keyword('import'),
    C.string()
  ),
  ([importKw, path]): ImportExpression => ({
    kind: 'import',
    path: path.value,
    location: importKw.location
  })
);

// --- Sequence term: everything else ---
const parseSequenceTerm: C.Parser<Expression> = C.choice(
  parseDefinition,
  parseImportExpression,
  parseThrush,
  parseLambdaExpression,
  // Do NOT include parseIfExpression here; instead, inline it below to ensure its branches do not parse semicolon sequences
  parseApplication,
  parseNumber,
  parseString,
  parseBoolean,
  parseIdentifier,
  parseList,
  parseRecord,
  parseAccessor,
  parseParenExpr
);

// Add parseIfExpression to the top of parseSequenceTerm choices
const parseSequenceTermWithIf: C.Parser<Expression> = C.choice(
  parseIfExpression,
  parseSequenceTerm
);

// --- Sequence (semicolon) ---
const parseSequence: C.Parser<Expression> = C.map(
  C.seq(
    C.lazy(() => parseSequenceTermWithIf),
    C.many(
      C.seq(
        C.punctuation(';'),
        C.lazy(() => parseSequenceTermWithIf)
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: 'binary',
        operator: ';',
        left: result,
        right,
        location: result.location
      };
    }
    return result;
  }
);

// --- Expression (top-level) ---
const parseExpr: C.Parser<Expression> = parseSequence;

// --- Top-level Declarations ---
const parseTopLevel: C.Parser<TopLevel> = parseExpr;

// --- Main Parse Function ---
export const parse = (tokens: Token[]): Program => {
  // Filter out EOF tokens for parsing
  const nonEOFTokens = tokens.filter(t => t.type !== 'EOF');
  
  // Parse a single expression (which can include semicolon operators)
  const result = parseTopLevel(nonEOFTokens);

  if (!result.success) {
    throw new Error(`Parse error: ${result.error}`);
  }

  // If there are leftover tokens, throw an error
  if (result.remaining.length > 0) {
    const next = result.remaining[0];
    throw new Error(`Unexpected token after expression: ${next.type} '${next.value}' at line ${next.location.start.line}, column ${next.location.start.column}`);
  }

  return {
    statements: [result.value],
    location: createLocation({ line: 1, column: 1 }, { line: 1, column: 1 })
  };
}; 