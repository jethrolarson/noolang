import { Token } from '../lexer';
import {
  Expression,
  Program,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  TopLevel,
  createLocation,
  DefinitionExpression,
  MutableDefinitionExpression,
  ImportExpression,
  AccessorExpression,
  Type,
  intType,
  stringType,
  boolType,
  unitType,
  listTypeWithElement,
  functionType,
  typeVariable,
  TypedExpression,
  ListExpression,
  WhereExpression,
  recordType,
  tupleType,
  tupleTypeConstructor,
} from "../ast";
import * as C from "./combinators";

// --- Helper: parse a single type atom (primitive, variable, record, tuple, list) ---
function parseTypeAtom(tokens: Token[]): C.ParseResult<Type> {
  // Try primitive types first
  const primitiveTypes = ["Number", "String", "Bool", "Unit"];
  for (const typeName of primitiveTypes) {
    const result = C.keyword(typeName)(tokens);
    if (result.success) {
      switch (typeName) {
        case "Number":
          return {
            success: true as const,
            value: intType(),
            remaining: result.remaining,
          };
        case "String":
          return {
            success: true as const,
            value: stringType(),
            remaining: result.remaining,
          };
        case "Bool":
          return {
            success: true as const,
            value: boolType(),
            remaining: result.remaining,
          };
        case "Unit":
          return {
            success: true as const,
            value: unitType(),
            remaining: result.remaining,
          };
      }
    }
  }

  // Try type variable
  if (
    tokens.length > 0 &&
    tokens[0].type === "IDENTIFIER" &&
    /^[a-z]/.test(tokens[0].value)
  ) {
    const varResult = C.identifier()(tokens);
    if (varResult.success) {
      return {
        success: true as const,
        value: typeVariable(varResult.value.value),
        remaining: varResult.remaining,
      };
    }
  }

  // Try record type
  const recordResult = C.seq(
    C.punctuation("{"),
    C.optional(
      C.sepBy(
        C.map(
          C.seq(
            C.identifier(),
            C.punctuation(":"),
            C.lazy(() => parseTypeExpression)
          ),
          ([name, colon, type]) => [name.value, type] as [string, Type]
        ),
        C.punctuation(",")
      )
    ),
    C.punctuation("}")
  )(tokens);
  if (recordResult.success) {
    const fields: Array<[string, Type]> = recordResult.value[1] || [];
    const fieldObj: Record<string, Type> = {};
    for (const [name, type] of fields) {
      fieldObj[name] = type;
    }
    return {
      success: true as const,
      value: recordType(fieldObj),
      remaining: recordResult.remaining,
    };
  }

  // Try tuple type
  const tupleResult = C.seq(
    C.punctuation("{"),
    C.optional(
      C.sepBy(
        C.lazy(() => parseTypeExpression),
        C.punctuation(",")
      )
    ),
    C.punctuation("}")
  )(tokens);
  if (tupleResult.success) {
    const elements = tupleResult.value[1] || [];
    return {
      success: true as const,
      value: tupleType(elements),
      remaining: tupleResult.remaining,
    };
  }

  // Try List type
  const listResult = C.seq(
    C.keyword("List"),
    C.lazy(() => parseTypeExpression)
  )(tokens);
  if (listResult.success) {
    return {
      success: true as const,
      value: listTypeWithElement(listResult.value[1]),
      remaining: listResult.remaining,
    };
  }

  // Try Tuple type constructor: Tuple T1 T2 T3
  const tupleConstructorResult = C.seq(
    C.keyword("Tuple"),
    C.many(C.lazy(() => parseTypeExpression))
  )(tokens);
  if (tupleConstructorResult.success) {
    const elementTypes = tupleConstructorResult.value[1];
    return {
      success: true as const,
      value: tupleTypeConstructor(elementTypes),
      remaining: tupleConstructorResult.remaining,
    };
  }

  return {
    success: false,
    error: "Expected type atom",
    position: tokens[0]?.location.start.line || 0,
  };
}

// --- Type Expression ---
export const parseTypeExpression: C.Parser<Type> = (tokens) => {
  // Try function type (right-associative): a -> b -> c FIRST
  const funcType = (() => {
    let leftResult = parseTypeAtom(tokens);
    if (!leftResult.success) return leftResult;
    let left = leftResult.value;
    let rest = leftResult.remaining;

    while (
      rest &&
      rest.length > 0 &&
      rest[0].type === "OPERATOR" &&
      rest[0].value === "->"
    ) {
      rest = rest.slice(1);
      const rightResult = parseTypeExpression(rest);
      if (!rightResult.success) return rightResult;
      if (!rightResult.value)
        return {
          success: false,
          error: "Expected type expression",
          position: tokens[0]?.location.start.line || 0,
        };
      left = functionType([left], rightResult.value);
      rest = rightResult.remaining;
    }
    return { success: true as const, value: left, remaining: rest };
  })();

  if (funcType.success && funcType.value) {
    return funcType;
  }

  // Try primitive types
  const primitiveTypes = ["Number", "String", "Bool", "Unit"];
  for (const typeName of primitiveTypes) {
    const result = C.keyword(typeName)(tokens);
    if (result.success) {
      switch (typeName) {
        case "Number":
          return {
            success: true as const,
            value: intType(),
            remaining: result.remaining,
          };
        case "String":
          return {
            success: true as const,
            value: stringType(),
            remaining: result.remaining,
          };
        case "Bool":
          return {
            success: true as const,
            value: boolType(),
            remaining: result.remaining,
          };
        case "Unit":
          return {
            success: true as const,
            value: unitType(),
            remaining: result.remaining,
          };
      }
    }
  }

  // Try type variable (lowercase identifier)
  if (
    tokens.length > 0 &&
    tokens[0].type === "IDENTIFIER" &&
    /^[a-z]/.test(tokens[0].value)
  ) {
    const varResult = C.identifier()(tokens);
    if (varResult.success) {
      return {
        success: true as const,
        value: typeVariable(varResult.value.value),
        remaining: varResult.remaining,
      };
    }
  }

  // Try record type: { name: String, age: Number }
  const recordResult = C.seq(
    C.punctuation("{"),
    C.optional(
      C.sepBy(
        C.map(
          C.seq(
            C.identifier(),
            C.punctuation(":"),
            C.lazy(() => parseTypeExpression)
          ),
          ([name, colon, type]) => [name.value, type] as [string, Type]
        ),
        C.punctuation(",")
      )
    ),
    C.punctuation("}")
  )(tokens);
  if (recordResult.success) {
    const fields: Array<[string, Type]> = recordResult.value[1] || [];
    const fieldObj: Record<string, Type> = {};
    for (const [name, type] of fields) {
      fieldObj[name] = type;
    }
    return {
      success: true as const,
      value: recordType(fieldObj),
      remaining: recordResult.remaining,
    };
  }

  // Try tuple type: { Number, String }
  const tupleResult = C.seq(
    C.punctuation("{"),
    C.optional(
      C.sepBy(
        C.lazy(() => parseTypeExpression),
        C.punctuation(",")
      )
    ),
    C.punctuation("}")
  )(tokens);
  if (tupleResult.success) {
    const elements = tupleResult.value[1] || [];
    return {
      success: true as const,
      value: tupleType(elements),
      remaining: tupleResult.remaining,
    };
  }

  // Try List type
  const listResult = C.seq(
    C.keyword("List"),
    C.lazy(() => parseTypeExpression)
  )(tokens);
  if (listResult.success) {
    return {
      success: true as const,
      value: listTypeWithElement(listResult.value[1]),
      remaining: listResult.remaining,
    };
  }

  return {
    success: false,
    error: "Expected type expression",
    position: tokens[0]?.location.start.line || 0,
  };
};
// --- Basic Parsers ---
const parseIdentifier = C.map(
  C.identifier(),
  (token): VariableExpression => ({
    kind: "variable",
    name: token.value,
    location: token.location,
  })
);

const parseNumber = C.map(
  C.number(),
  (token): LiteralExpression => ({
    kind: "literal",
    value: parseFloat(token.value),
    location: token.location,
  })
);

const parseString = C.map(
  C.string(),
  (token): LiteralExpression => ({
    kind: "literal",
    value: token.value,
    location: token.location,
  })
);

const parseBoolean = C.map(
  C.choice(C.keyword("true"), C.keyword("false")),
  (token): LiteralExpression => ({
    kind: "literal",
    value: token.value === "true",
    location: token.location,
  })
);

const parseAccessor = C.map(
  C.accessor(),
  (token): AccessorExpression => ({
    kind: "accessor",
    field: token.value,
    location: token.location,
  })
);

// --- Record Parsing ---
const parseRecordFieldName = C.map(
  C.accessor(),
  (token) => token.value // Just get the field name without @
);

// Parse an expression that stops at @ (accessor tokens) or semicolon
const parseRecordFieldValue = (tokens: Token[]): C.ParseResult<Expression> => {
  // Use the full expression parser to parse the complete expression
  // This includes records, so we can parse nested records
  const result = C.lazy(() => parseSequence)(tokens);
  if (!result.success) {
    return result;
  }

  // The expression parser should have consumed all the tokens it needs
  // and left us with the remaining tokens that come after the expression
  return {
    success: true,
    value: result.value,
    remaining: result.remaining,
  };
};

const parseRecordField = C.map(
  C.seq(parseRecordFieldName, parseRecordFieldValue),
  ([fieldName, value]) => ({
    name: fieldName,
    value,
    isNamed: true,
  })
);

// Parse a single record field (named or positional)
const parseRecordFieldOrPositional =
  (
    index: number
  ): C.Parser<{ name: string; value: Expression; isNamed: boolean }> =>
  (tokens) => {
    // Try to parse as named field first (with accessor)
    const namedFieldResult = parseRecordField(tokens);
    if (namedFieldResult.success) {
      return {
        ...namedFieldResult,
        value: { ...namedFieldResult.value, isNamed: true },
      };
    }
    // If that fails, try to parse as positional field (expression without accessor)
    const positionalFieldResult = parseRecordFieldValue(tokens);
    if (positionalFieldResult.success) {
      return {
        success: true,
        value: {
          name: `@${index}`,
          value: positionalFieldResult.value,
          isNamed: false,
        },
        remaining: positionalFieldResult.remaining,
      };
    }
    return {
      success: false,
      error: "Expected record field (named or positional)",
      position: tokens[0]?.location.start.line || 0,
    };
  };

// Custom parser for a sequence of fields separated by semicolons
const parseRecordFields: C.Parser<{ name: string; value: Expression }[]> = (
  tokens
) => {
  let fields: { name: string; value: Expression; isNamed: boolean }[] = [];
  let rest = tokens;
  // Parse first field
  const firstFieldResult = parseRecordFieldOrPositional(0)(rest);
  if (!firstFieldResult.success) {
    return {
      success: false,
      error: "Expected at least one record field",
      position: tokens[0]?.location.start.line || 0,
    };
  }
  fields.push(firstFieldResult.value);
  rest = firstFieldResult.remaining;
  const isNamed = firstFieldResult.value.isNamed;
  // Parse additional fields, each preceded by a comma
  while (rest.length > 0) {
    const commaResult = C.punctuation(",")(rest);
    if (!commaResult.success) {
      break; // No more commas, we're done
    }
    rest = commaResult.remaining;
    const fieldResult = parseRecordFieldOrPositional(fields.length)(rest);
    if (!fieldResult.success) {
      // Check if this is a trailing comma (no more fields after comma)
      // Look ahead to see if the next token is a closing brace
      if (
        rest.length > 0 &&
        rest[0].type === "PUNCTUATION" &&
        rest[0].value === "}"
      ) {
        // This is a trailing comma, which is allowed
        break;
      }
      return {
        success: false,
        error: "Expected field after comma",
        position: rest[0]?.location.start.line || 0,
      };
    }
    if (fieldResult.value.isNamed !== isNamed) {
      return {
        success: false,
        error:
          "Cannot mix named and positional fields in the same record/tuple",
        position: rest[0]?.location.start.line || 0,
      };
    }
    fields.push(fieldResult.value);
    rest = fieldResult.remaining;
  }
  // Remove isNamed before returning
  return {
    success: true,
    value: fields.map(({ isNamed, ...rest }) => rest),
    remaining: rest,
  };
};

// --- Record/Tuple Parsing ---
const parseRecord = C.map(
  C.seq(C.punctuation("{"), C.optional(parseRecordFields), C.punctuation("}")),
  ([open, fields, close]): Expression => {
    const fieldsList = fields || [];
    if (fieldsList.length === 0) {
      // Empty braces: unit
      return {
        kind: "unit",
        location: open.location,
      } as import("../ast").UnitExpression;
    }
    const allNamed = fieldsList.every((f) => f.name[0] !== "@");
    const allPositional = fieldsList.every((f, i) => f.name === `@${i}`);
    if (allNamed) {
      // All named fields: record
      return {
        kind: "record",
        fields: fieldsList,
        location: open.location,
      } as import("../ast").RecordExpression;
    } else if (allPositional) {
      // All positional fields: tuple
      return {
        kind: "tuple",
        elements: fieldsList.map((f) => f.value),
        location: open.location,
      } as import("../ast").TupleExpression;
    } else {
      // Mixed fields: error
      throw new Error(
        "Cannot mix named and positional fields in the same record/tuple"
      );
    }
  }
);

// --- Parenthesized Expressions ---
const parseParenExpr: C.Parser<Expression> = C.map(
  C.seq(
    C.punctuation("("),
    C.lazy(() => parseSequence), // Use lazy evaluation to handle circular dependency
    C.punctuation(")")
  ),
  ([open, expr, close]) => expr
);

// --- Function Body Parser ---
// Allows a parenthesized sequence, or a single non-sequence expression
const parseFunctionBody: C.Parser<Expression> = (tokens) => {
  // Try parenthesized expression first
  const parenResult = parseParenExpr(tokens);
  if (parenResult.success) return parenResult;

  // Try a single non-sequence expression, but fail if next token is a semicolon
  const exprResult = parseAdditive(tokens);
  if (!exprResult.success) return exprResult;
  const next = exprResult.remaining[0];
  if (next && next.type === "PUNCTUATION" && next.value === ";") {
    return {
      success: false,
      error: "Unexpected semicolon in function body",
      position: next.location.start.line,
    };
  }
  return exprResult;
};

// --- Lambda Expression ---
const parseLambdaExpression: C.Parser<FunctionExpression> = (tokens) => {
  // Try to parse fn keyword first
  const fnResult = C.keyword("fn")(tokens);
  if (!fnResult.success) {
    return fnResult;
  }

  // Try unit parameter patterns first
  let paramNames: string[] = [];
  let remaining = fnResult.remaining;

  const parenResult = C.seq(C.punctuation("("), C.punctuation(")"))(remaining);
  if (parenResult.success) {
    // No parameters (should not be used in Noolang, but keep for syntax completeness)
    paramNames = [];
    remaining = parenResult.remaining;
  } else {
    const braceResult = C.seq(
      C.punctuation("{"),
      C.punctuation("}")
    )(remaining);
    if (braceResult.success) {
      // Unit parameter
      paramNames = ["_unit"];
      remaining = braceResult.remaining;
    } else {
      // Try multiple identifiers last
      const idResult = C.many(C.identifier())(remaining);
      if (idResult.success) {
        paramNames = idResult.value.map((p) => p.value);
        remaining = idResult.remaining;
      } else {
        return {
          success: false,
          error: "Expected parameter list, parentheses, or braces",
          position: remaining[0]?.location.start.line || 0,
        };
      }
    }
  }

  // Parse the arrow
  const arrowResult = C.operator("=>")(remaining);
  if (!arrowResult.success) {
    return arrowResult;
  }

  // Parse the body (use parseSequenceTermWithIf to allow full expressions)
  const bodyResult = C.lazy(() => parseSequenceTermWithIf)(
    arrowResult.remaining
  );
  if (!bodyResult.success) {
    return bodyResult;
  }

  return {
    success: true,
    value: {
      kind: "function",
      params: paramNames,
      body: bodyResult.value,
      location: fnResult.value.location,
    },
    remaining: bodyResult.remaining,
  };
};

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
      error: "Expected at least one list element",
      position: tokens[0]?.location.start.line || 0,
    };
  }
  elements.push(firstElementResult.value);
  rest = firstElementResult.remaining;

  // Parse additional elements, each preceded by a comma
  while (rest.length > 0) {
    const commaResult = C.punctuation(",")(rest);
    if (!commaResult.success) {
      break; // No more commas, we're done
    }
    rest = commaResult.remaining;

    const elementResult = C.lazy(() => parseThrush)(rest);
    if (!elementResult.success) {
      // Check if this is a trailing comma (no more elements after comma)
      // Look ahead to see if the next token is a closing bracket
      if (
        rest.length > 0 &&
        rest[0].type === "PUNCTUATION" &&
        rest[0].value === "]"
      ) {
        // This is a trailing comma, which is allowed
        break;
      }
      return {
        success: false,
        error: "Expected element after comma",
        position: rest[0]?.location.start.line || 0,
      };
    }
    elements.push(elementResult.value);
    rest = elementResult.remaining;
  }

  return {
    success: true,
    value: elements,
    remaining: rest,
  };
};

const parseList: C.Parser<ListExpression> = C.map(
  C.seq(C.punctuation("["), C.optional(parseListElements), C.punctuation("]")),
  ([open, elements, close]) => {
    const elementsList: Expression[] = elements || [];
    return {
      kind: "list",
      elements: elementsList,
      location: open.location,
    };
  }
);

// --- Import Expression ---
const parseImportExpression: C.Parser<ImportExpression> = C.map(
  C.seq(C.keyword("import"), C.string()),
  ([importKw, path]): ImportExpression => ({
    kind: "import",
    path: path.value,
    location: importKw.location,
  })
);

// --- If Expression (special: do not allow semicolon in branches) ---
const parseIfExpression: C.Parser<Expression> = C.map(
  C.seq(
    C.keyword("if"),
    C.lazy(() => parseSequenceTerm),
    C.keyword("then"),
    C.lazy(() => parseSequenceTerm),
    C.keyword("else"),
    C.lazy(() => parseSequenceTerm)
  ),
  ([ifKw, condition, thenKw, thenExpr, elseKw, elseExpr]) => {
    return {
      kind: "if",
      condition,
      then: thenExpr,
      else: elseExpr,
      location: ifKw.location,
    };
  }
);

// --- Primary Expressions (no unary minus) ---
const parsePrimary: C.Parser<Expression> = C.choice(
  parseIfExpression,
  parseNumber,
  parseString,
  parseBoolean,
  parseIdentifier,
  parseList,
  parseRecord,
  parseAccessor,
  parseParenExpr,
  parseLambdaExpression,
  C.lazy(() => parseDefinitionWithType),
  parseImportExpression
);

// Add parseList to parsePrimary after it's defined
const parsePrimaryWithList: C.Parser<Expression> = C.choice(
  parseIfExpression, // <-- allow if expressions
  parseNumber,
  parseString,
  parseBoolean,
  parseIdentifier,
  parseList,
  parseRecord,
  parseAccessor,
  parseParenExpr, // <-- try parenthesized expressions first
  parseLambdaExpression, // <-- allow lambda expressions as primary expressions
  C.lazy(() => parseDefinitionWithType), // <-- allow definitions as primary expressions
  parseImportExpression // <-- allow import as a primary expression
);

// --- Simple Expression (no function applications) ---
const parseSimpleExpression: C.Parser<Expression> = C.map(
  C.seq(
    parsePrimaryWithList,
    C.many(
      C.seq(
        C.choice(
          C.operator("+"),
          C.operator("-"),
          C.operator("*"),
          C.operator("/"),
          C.operator("<"),
          C.operator(">"),
          C.operator("<="),
          C.operator(">="),
          C.operator("=="),
          C.operator("!=")
        ),
        parsePrimaryWithList
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: op.value as
          | "+"
          | "-"
          | "*"
          | "/"
          | "<"
          | ">"
          | "<="
          | ">="
          | "=="
          | "!=",
        left: result,
        right,
        location: result.location,
      };
    }
    return result;
  }
);

// --- Unary Operators (negation, only if '-' is adjacent to the next token) ---
const parseUnary: C.Parser<Expression> = (tokens) => {
  if (
    tokens.length >= 2 &&
    tokens[0].type === "OPERATOR" &&
    tokens[0].value === "-"
  ) {
    const minusToken = tokens[0];
    const nextToken = tokens[1];
    // Check if minus is directly adjacent to the next token (no space)
    if (
      minusToken.location.end.line === nextToken.location.start.line &&
      minusToken.location.end.column === nextToken.location.start.column
    ) {
      // Parse as unary minus
      const operandResult = parsePrimary(tokens.slice(1));
      if (!operandResult.success) return operandResult;
      return {
        success: true,
        value: {
          kind: "binary",
          operator: "*",
          left: { kind: "literal", value: -1, location: minusToken.location },
          right: operandResult.value,
          location: minusToken.location,
        },
        remaining: operandResult.remaining,
      };
    }
  }
  // Otherwise, fall through to parsePrimary
  return parsePrimary(tokens);
};

// --- Function Application (left-associative, tightest binding) ---
const parseApplication: C.Parser<Expression> = C.map(
  C.seq(parseUnary, C.many(parseUnary)),
  ([func, args]) => {
    let result = func;
    for (const arg of args) {
      result = {
        kind: "application",
        func: result,
        args: [arg],
        location: result.location,
      };
    }
    return result;
  }
);

// --- Multiplicative (*, /) ---
const parseMultiplicative: C.Parser<Expression> = C.map(
  C.seq(
    parseApplication,
    C.many(C.seq(C.choice(C.operator("*"), C.operator("/")), parseApplication))
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: op.value as "*" | "/",
        left: result,
        right,
        location: result.location,
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
      C.seq(C.choice(C.operator("+"), C.operator("-")), parseMultiplicative)
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: op.value as "+" | "-",
        left: result,
        right,
        location: result.location,
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
          C.operator("<"),
          C.operator(">"),
          C.operator("<="),
          C.operator(">="),
          C.operator("=="),
          C.operator("!=")
        ),
        parseAdditive
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: op.value as "<" | ">" | "<=" | ">=" | "==" | "!=",
        left: result,
        right,
        location: result.location,
      };
    }
    return result;
  }
);

// --- Composition (|>, <|) ---
const parseCompose: C.Parser<Expression> = C.map(
  C.seq(
    parseComparison,
    C.many(C.seq(C.choice(C.operator("|>"), C.operator("<|")), parseComparison))
  ),
  ([left, rest]) => {
    // Build steps array for pipeline expression
    const steps = [left];
    for (const [op, right] of rest) {
      steps.push(right);
    }

    // If we have multiple steps, create a pipeline expression
    if (steps.length > 1) {
      return {
        kind: "pipeline",
        steps,
        location: left.location,
      } as import("../ast").PipelineExpression;
    }

    // Otherwise just return the single expression
    return left;
  }
);

// --- Thrush (|) ---
const parseThrush: C.Parser<Expression> = C.map(
  C.seq(parseCompose, C.many(C.seq(C.operator("|"), parseCompose))),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: "|",
        left: result,
        right,
        location: result.location,
      };
    }
    return result;
  }
);

// --- Dollar ($) - Low precedence function application ---
const parseDollar: C.Parser<Expression> = C.map(
  C.seq(parseThrush, C.many(C.seq(C.operator("$"), parseThrush))),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: "$",
        left: result,
        right,
        location: result.location,
      };
    }
    return result;
  }
);

// --- Typed Expression (expr : type) ---
const parseTypedExpression: C.Parser<Expression> = C.map(
  C.seq(
    parseDollar,
    C.punctuation(":"),
    C.lazy(() => parseTypeExpression)
  ),
  ([expr, colon, type]): TypedExpression => ({
    kind: "typed",
    expression: expr,
    type: type as Type,
    location: expr.location,
  })
);

// --- Definition ---
const parseDefinition: C.Parser<DefinitionExpression> = C.map(
  C.seq(
    C.identifier(),
    C.operator("="),
    C.lazy(() => parseSequenceTermWithIf)
  ),
  ([name, equals, value]): DefinitionExpression => {
    return {
      kind: "definition",
      name: name.value,
      value,
      location: name.location,
    };
  }
);

// --- Definition with typed expression ---
const parseDefinitionWithType: C.Parser<DefinitionExpression> = C.map(
  C.seq(
    C.identifier(),
    C.operator("="),
    C.lazy(() => parseExprWithType)
  ),
  ([name, equals, value]): DefinitionExpression => {
    return {
      kind: "definition",
      name: name.value,
      value,
      location: name.location,
    };
  }
);

// --- Mutable Definition ---
const parseMutableDefinition: C.Parser<
  import("../ast").MutableDefinitionExpression
> = C.map(
  C.seq(
    C.keyword("mut"),
    C.identifier(),
    C.operator("="),
    C.lazy(() => parseSequenceTermWithIf)
  ),
  ([
    mut,
    name,
    equals,
    value,
  ]): import("../ast").MutableDefinitionExpression => {
    return {
      kind: "mutable-definition",
      name: name.value,
      value,
      location: mut.location,
    };
  }
);

// --- Mutation ---
const parseMutation: C.Parser<import("../ast").MutationExpression> = C.map(
  C.seq(
    C.keyword("mut!"),
    C.identifier(),
    C.operator("="),
    C.lazy(() => parseSequenceTermWithIf)
  ),
  ([mut, name, equals, value]): import("../ast").MutationExpression => {
    return {
      kind: "mutation",
      target: name.value,
      value,
      location: mut.location,
    };
  }
);

// Custom parser for where clause definitions (both regular and mutable)
const parseWhereDefinition: C.Parser<
  DefinitionExpression | MutableDefinitionExpression
> = (tokens) => {
  // Try mutable definition first
  const mutableResult = parseMutableDefinition(tokens);
  if (mutableResult.success) {
    return mutableResult;
  }
  // Try regular definition
  const regularResult = parseDefinition(tokens);
  if (regularResult.success) {
    return regularResult;
  }
  return {
    success: false,
    error: "Expected definition in where clause",
    position: tokens[0]?.location.start.line || 0,
  };
};

// --- Where Expression ---
const parseWhereExpression: C.Parser<WhereExpression> = C.map(
  C.seq(
    C.lazy(() => parseSequenceTermWithIfExceptRecord), // Main expression (no records to avoid circular dependency)
    C.keyword("where"),
    C.punctuation("("),
    C.sepBy(parseWhereDefinition, C.punctuation(";")),
    C.punctuation(")")
  ),
  ([main, where, openParen, definitions, closeParen]): WhereExpression => {
    return {
      kind: "where",
      main,
      definitions,
      location: main.location,
    };
  }
);

// --- Sequence term: everything else ---
const parseSequenceTerm: C.Parser<Expression> = C.choice(
  parseDefinitionWithType, // allow definitions with type annotations
  parseDefinition, // fallback to regular definitions
  parseIfExpression,
  parseRecord,
  parseMutableDefinition,
  parseMutation,
  parseWhereExpression,
  parseImportExpression,
  parseDollar,
  parseThrush,
  parseLambdaExpression,
  parseNumber,
  parseString,
  parseBoolean,
  parseIdentifier,
  parseList,
  parseAccessor,
  parseParenExpr,
  parseTypedExpression
);

// Version without records to avoid circular dependency
const parseSequenceTermExceptRecord: C.Parser<Expression> = C.choice(
  parseDefinition,
  parseMutableDefinition,
  parseMutation,
  parseImportExpression,
  parseThrush,
  parseLambdaExpression,
  parseNumber,
  parseString,
  parseBoolean,
  parseIdentifier,
  parseList,
  parseAccessor,
  parseParenExpr
);

// parseSequenceTerm now includes parseIfExpression
const parseSequenceTermWithIf: C.Parser<Expression> = parseSequenceTerm;

// Version with if but without records to avoid circular dependency
const parseSequenceTermWithIfExceptRecord: C.Parser<Expression> = C.choice(
  parseSequenceTermExceptRecord,
  parseIfExpression
);

// --- Sequence Term: definition or expression ---
const parseSequenceTermNew: C.Parser<Expression> = C.choice(
  parseDefinitionWithType, // allow definitions
  parseDollar // allow full expressions with precedence
);

// --- Expression with type annotation (just above semicolon) ---
const parseExprWithType: C.Parser<Expression> = C.choice(
  C.map(
    C.seq(
      parseSequenceTermNew,
      C.punctuation(":"),
      C.lazy(() => parseTypeExpression)
    ),
    ([expr, colon, type]): TypedExpression => ({
      kind: "typed",
      expression: expr,
      type,
      location: expr.location,
    })
  ),
  parseSequenceTermNew
);

// --- Sequence (semicolon) ---
// Accepts a sequence of definitions and/or expressions, separated by semicolons
const parseSequence: C.Parser<Expression> = C.map(
  C.seq(
    C.lazy(() => parseSequenceTermWithIf),
    C.many(
      C.seq(
        C.punctuation(";"),
        C.lazy(() => parseSequenceTermWithIf)
      )
    )
  ),
  ([left, rest]) => {
    let result = left;
    for (const [op, right] of rest) {
      result = {
        kind: "binary",
        operator: ";",
        left: result,
        right,
        location: result.location,
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
  const nonEOFTokens = tokens.filter((t) => t.type !== "EOF");

  // Parse multiple top-level expressions separated by semicolons
  let statements: Expression[] = [];
  let rest = nonEOFTokens;
  while (rest.length > 0) {
    // Skip leading semicolons
    while (
      rest.length > 0 &&
      rest[0].type === "PUNCTUATION" &&
      rest[0].value === ";"
    ) {
      rest = rest.slice(1);
    }
    if (rest.length === 0) break;
    const result = parseTopLevel(rest);
    if (!result.success) {
      // Include line and column information in parse error
      const errorLocation =
        result.position > 0 ? ` at line ${result.position}` : "";
      throw new Error(`Parse error: ${result.error}${errorLocation}`);
    }
    statements.push(result.value);
    rest = result.remaining;
    // Skip trailing semicolons after each statement
    while (
      rest.length > 0 &&
      rest[0].type === "PUNCTUATION" &&
      rest[0].value === ";"
    ) {
      rest = rest.slice(1);
    }
  }
  // If there are still leftover tokens that aren't semicolons or EOF, throw an error
  if (rest.length > 0) {
    const next = rest[0];
    throw new Error(
      `Unexpected token after expression: ${next.type} '${next.value}' at line ${next.location.start.line}, column ${next.location.start.column}`
    );
  }
  return {
    statements,
    location: createLocation({ line: 1, column: 1 }, { line: 1, column: 1 }),
  };
}; 