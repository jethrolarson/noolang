import type { Token } from "../lexer";
import {
	type Expression,
	type Program,
	type LiteralExpression,
	type VariableExpression,
	type FunctionExpression,
	createLocation,
	type DefinitionExpression,
	type MutableDefinitionExpression,
	type ImportExpression,
	type AccessorExpression,
	type Type,
	type Effect,
	intType,
	stringType,
	unitType,
	listTypeWithElement,
	functionType,
	typeVariable,
	type TypedExpression,
	type ConstrainedExpression,
	type ListExpression,
	type WhereExpression,
	recordType,
	tupleType,
	tupleTypeConstructor,
	type ConstraintExpr,
	type TypeDefinitionExpression,
	type MatchExpression,
	type ConstructorDefinition,
	type Pattern,
	type MatchCase,
	type UnitExpression,
	type RecordExpression,
	type TupleExpression,
	type ConstraintDefinitionExpression,
	type ImplementDefinitionExpression,
	type ConstraintFunction,
	type ImplementationFunction,
} from "../ast";
import * as C from "./combinators";

// --- Helper: parse type name (IDENTIFIER or type-related KEYWORD) ---
const parseTypeName: C.Parser<Token> = (tokens: Token[]) => {
  if (tokens.length === 0) {
    return {
      success: false,
      error: "Expected type name, but got end of input",
      position: 0,
    };
  }

  const [first, ...rest] = tokens;
  const typeKeywords = ["Int", "Number", "String", "Unit", "List"];

  if (
    first.type === "IDENTIFIER" ||
    (first.type === "KEYWORD" && typeKeywords.includes(first.value))
  ) {
    return {
      success: true,
      value: first,
      remaining: rest,
    };
  }

  return {
    success: false,
    error: `Expected type name, but got ${first.type} '${first.value}'`,
    position: first.location.start.line,
  };
};

// --- Helper: parse a single type atom (primitive, variable, record, tuple, list) ---
function parseTypeAtom(tokens: Token[]): C.ParseResult<Type> {
  // Try primitive types first
  const primitiveTypes = ["Int", "Number", "String", "Unit"];
  for (const typeName of primitiveTypes) {
    const result = C.keyword(typeName)(tokens);
    if (result.success) {
      switch (typeName) {
        case "Int":
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

  // Try parenthesized type: (Type)
  const parenResult = C.seq(
    C.punctuation("("),
    C.lazy(() => parseTypeExpression),
    C.punctuation(")")
  )(tokens);
  if (parenResult.success) {
    return {
      success: true as const,
      value: parenResult.value[1],
      remaining: parenResult.remaining,
    };
  }

  // Try user-defined type constructor: TypeName arg1 arg2 ...
  if (
    tokens.length > 0 &&
    tokens[0].type === "IDENTIFIER" &&
    /^[A-Z]/.test(tokens[0].value)
  ) {
    const typeNameResult = C.identifier()(tokens);
    if (typeNameResult.success) {
      // Try to parse type arguments
      const argsResult = C.many(C.lazy(() => parseTypeAtom))(
        typeNameResult.remaining
      );
      if (argsResult.success) {
        return {
          success: true as const,
          value: {
            kind: "variant",
            name: typeNameResult.value.value,
            args: argsResult.value,
          } as Type,
          remaining: argsResult.remaining,
        };
      }
    }
  }

  return {
    success: false,
    error: "Expected type atom",
    position: tokens[0]?.location.start.line || 0,
  };
}

// --- Type Expression ---
// Helper function to parse function types without top-level effects
const parseFunctionTypeWithoutEffects: C.Parser<Type> = (tokens) => {
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
    const rightResult = parseFunctionTypeWithoutEffects(rest);
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
};

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
      const rightResult = parseFunctionTypeWithoutEffects(rest);
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
    
    // Parse effects at the end of the entire function type chain
    let effects = new Set<Effect>();
    let effectRest = rest;
    
    // Parse effects: !effect1 !effect2 ...
    while (
      effectRest &&
      effectRest.length > 0 &&
      effectRest[0].type === "OPERATOR" &&
      effectRest[0].value === "!"
    ) {
      effectRest = effectRest.slice(1); // consume !
      
      // Expect an effect name (identifier or keyword)
      if (
        !effectRest ||
        effectRest.length === 0 ||
        (effectRest[0].type !== "IDENTIFIER" && effectRest[0].type !== "KEYWORD")
      ) {
        return {
          success: false,
          error: "Expected effect name after !",
          position: effectRest?.[0]?.location?.start?.line || 0,
        };
      }
      
      const effectName = effectRest[0].value;
      
      // Validate effect name
      const validEffects: Effect[] = ["log", "read", "write", "state", "time", "rand", "ffi", "async"];
      if (!validEffects.includes(effectName as Effect)) {
        return {
          success: false,
          error: `Invalid effect: ${effectName}. Valid effects: ${validEffects.join(", ")}`,
          position: effectRest[0].location.start.line,
        };
      }
      
      effects.add(effectName as Effect);
      effectRest = effectRest.slice(1); // consume effect name
    }
    
    // Apply effects to the function type (including empty effects)
    if (left.kind === 'function') {
      left = { ...left, effects };
    }
    
    return { success: true as const, value: left, remaining: effectRest };
  })();

  if (funcType.success && funcType.value) {
    return funcType;
  }
  
  // If function type parsing failed with a specific effect error, return that error
  if (!funcType.success && (
    funcType.error.includes("Invalid effect:") || 
    funcType.error.includes("Expected effect name after !")
  )) {
    return funcType as C.ParseError;
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
      } as UnitExpression;
    }
    const allNamed = fieldsList.every((f) => f.name[0] !== "@");
    const allPositional = fieldsList.every((f, i) => f.name === `@${i}`);
    if (allNamed) {
      // All named fields: record
      return {
        kind: "record",
        fields: fieldsList,
        location: open.location,
      } as RecordExpression;
    } else if (allPositional) {
      // All positional fields: tuple
      return {
        kind: "tuple",
        elements: fieldsList.map((f) => f.value),
        location: open.location,
      } as TupleExpression;
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
    C.lazy(() => parseSequence), // Use parseSequence to allow full semicolon-separated sequences
    C.punctuation(")")
  ),
  ([open, expr, close]) => expr
);

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
const parsePrimary: C.Parser<Expression> = (tokens) => {
  // DEBUG: Log tokens at entry
  if (process.env.NOO_DEBUG_PARSE) {
    console.log("parsePrimary tokens:", tokens.map((t) => t.value).join(" "));
  }
  
  // Fast token-based dispatch instead of sequential choice attempts
  if (tokens.length === 0) {
    return { success: false, error: "Unexpected end of input", position: 0 };
  }
  
  const firstToken = tokens[0];
  let result: C.ParseResult<Expression>;
  
  // Dispatch based on token type and value for O(1) selection
  switch (firstToken.type) {
    case "NUMBER":
      result = parseNumber(tokens);
      break;
    case "STRING": 
      result = parseString(tokens);
      break;
    case "IDENTIFIER":
      result = parseIdentifier(tokens);
      break;
    case "ACCESSOR":
      result = parseAccessor(tokens);
      break;
    case "PUNCTUATION":
      if (firstToken.value === "[") {
        result = parseList(tokens);
      } else if (firstToken.value === "{") {
        result = parseRecord(tokens);
      } else if (firstToken.value === "(") {
        result = parseParenExpr(tokens);
      } else {
        result = { success: false, error: `Unexpected punctuation: ${firstToken.value}`, position: firstToken.location.start.line };
      }
      break;
    case "KEYWORD":
      if (firstToken.value === "fn") {
        result = parseLambdaExpression(tokens);
      } else if (firstToken.value === "let") {
        result = C.lazy(() => parseDefinitionWithType)(tokens);
      } else if (firstToken.value === "import") {
        result = parseImportExpression(tokens);
      } else {
        result = { success: false, error: `Unexpected keyword: ${firstToken.value}`, position: firstToken.location.start.line };
      }
      break;
    default:
      result = { success: false, error: `Unexpected token type: ${firstToken.type}`, position: firstToken.location.start.line };
      break;
  }
  
  // DEBUG: Log result
  if (process.env.NOO_DEBUG_PARSE) {
    console.log(
      "parsePrimary result:",
      result.success ? result.value : result.error
    );
  }
  return result;
};

// --- Primary with Postfix (type annotations) ---
const parsePrimaryWithPostfix: C.Parser<Expression> = (tokens) => {
  if (process.env.NOO_DEBUG_PARSE) {
    console.log(
      "parsePrimaryWithPostfix tokens:",
      tokens.map((t) => t.value).join(" ")
    );
  }
  const primaryResult = parsePrimary(tokens);
  if (!primaryResult.success) return primaryResult;
  const postfixResult = parsePostfixFromResult(
    primaryResult.value,
    primaryResult.remaining
  );
  if (process.env.NOO_DEBUG_PARSE) {
    console.log(
      "parsePrimaryWithPostfix result:",
      postfixResult.success ? postfixResult.value : postfixResult.error
    );
  }
  return postfixResult;
};

// --- Unary Operators (negation, only if '-' is adjacent to the next token) ---
const parseUnary: C.Parser<Expression> = (tokens) => {
  if (process.env.NOO_DEBUG_PARSE) {
    console.log("parseUnary tokens:", tokens.map((t) => t.value).join(" "));
  }
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
      const operandResult = parsePrimaryWithPostfix(tokens.slice(1));
      if (!operandResult.success) return operandResult;
      const result = {
        success: true as const,
        value: {
          kind: "binary" as const,
          operator: "*" as const,
          left: {
            kind: "literal" as const,
            value: -1,
            location: minusToken.location,
          },
          right: operandResult.value,
          location: minusToken.location,
        },
        remaining: operandResult.remaining,
      };
      if (process.env.NOO_DEBUG_PARSE) {
        console.log("parseUnary result (negation):", result.value);
      }
      return result;
    }
  }
  // Otherwise, fall through to parsePrimaryWithPostfix
  const result = parsePrimaryWithPostfix(tokens);
  if (process.env.NOO_DEBUG_PARSE) {
    console.log(
      "parseUnary result:",
      result.success ? result.value : result.error
    );
  }
  return result;
};

// --- Function Application (left-associative, tightest binding) ---
const parseApplication: C.Parser<Expression> = (tokens) => {
  const appResult = C.map(
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
  )(tokens);

  if (!appResult.success) return appResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(appResult.value, appResult.remaining);
};

// --- Multiplicative (*, /) ---
const parseMultiplicative: C.Parser<Expression> = (tokens) => {
  const multResult = C.map(
    C.seq(
      parseApplication,
      C.many(
        C.seq(C.choice(C.operator("*"), C.operator("/")), parseApplication)
      )
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
  )(tokens);

  if (!multResult.success) return multResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(multResult.value, multResult.remaining);
};

// --- Additive (+, -) ---
const parseAdditive: C.Parser<Expression> = (tokens) => {
  const addResult = C.map(
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
  )(tokens);

  if (!addResult.success) return addResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(addResult.value, addResult.remaining);
};

// --- Comparison (<, >, <=, >=, ==, !=) ---
const parseComparison: C.Parser<Expression> = (tokens) => {
  const compResult = C.map(
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
  )(tokens);

  if (!compResult.success) return compResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(compResult.value, compResult.remaining);
};

// --- Composition (|>, <|) ---
const parseCompose: C.Parser<Expression> = (tokens) => {
  const compResult = C.map(
    C.seq(
      parseComparison,
      C.many(
        C.seq(C.choice(C.operator("|>"), C.operator("<|")), parseComparison)
      )
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
  )(tokens);

  if (!compResult.success) return compResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(compResult.value, compResult.remaining);
};

// --- Thrush (|) ---
const parseThrush: C.Parser<Expression> = (tokens) => {
  const thrushResult = C.map(
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
  )(tokens);

  if (!thrushResult.success) return thrushResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(thrushResult.value, thrushResult.remaining);
};

// --- Dollar ($) - Low precedence function application ---
const parseDollar: C.Parser<Expression> = (tokens) => {
  const dollarResult = C.map(
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
  )(tokens);

  if (!dollarResult.success) return dollarResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(dollarResult.value, dollarResult.remaining);
};

// --- If Expression (after dollar, before sequence) ---
const parseIfAfterDollar: C.Parser<Expression> = (tokens) => {
  const ifResult = parseIfExpression(tokens);
  if (!ifResult.success) return ifResult;

  // Apply postfix operators (type annotations) to the result
  return parsePostfixFromResult(ifResult.value, ifResult.remaining);
};

// Helper function to apply postfix operators to an expression
const parsePostfixFromResult = (
  expr: Expression,
  tokens: Token[]
): C.ParseResult<Expression> => {
  let result = expr;
  let remaining = tokens;

  // Try to parse postfix type annotations
  while (remaining.length > 0) {
    // Try to parse : type given constraint
    if (
      remaining.length >= 2 &&
      remaining[0].type === "PUNCTUATION" &&
      remaining[0].value === ":"
    ) {
      const typeResult = parseTypeExpression(remaining.slice(1));
      if (!typeResult.success) break;

      // Check if there's a "given" constraint after the type
      if (
        typeResult.remaining.length > 0 &&
        typeResult.remaining[0].type === "KEYWORD" &&
        typeResult.remaining[0].value === "given"
      ) {
        const constraintResult = parseConstraintExpr(
          typeResult.remaining.slice(1)
        );
        if (!constraintResult.success) break;

        result = {
          kind: "constrained",
          expression: result,
          type: typeResult.value,
          constraint: constraintResult.value,
          location: result.location,
        };
        remaining = constraintResult.remaining;
        continue;
      } else {
        // Just a type annotation without constraints
        result = {
          kind: "typed",
          expression: result,
          type: typeResult.value,
          location: result.location,
        };
        remaining = typeResult.remaining;
        continue;
      }
    }

    // No more postfix operators
    break;
  }

  return {
    success: true,
    value: result,
    remaining,
  };
};

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

// --- Definition with typed expression (now just a regular definition) ---
const parseDefinitionWithType: C.Parser<DefinitionExpression> = parseDefinition;

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

// --- ADT Constructor ---
const parseConstructor: C.Parser<ConstructorDefinition> = C.map(
  C.seq(parseTypeName, C.many(C.lazy(() => parseTypeExpression))),
  ([name, args]): ConstructorDefinition => ({
    name: name.value,
    args,
    location: createLocation(name.location.start, name.location.end),
  })
);

// --- Type Definition ---
const parseTypeDefinition: C.Parser<TypeDefinitionExpression> = C.map(
  C.seq(
    C.keyword("type"),
    parseTypeName,
    C.many(C.identifier()),
    C.operator("="),
    C.sepBy(parseConstructor, C.operator("|"))
  ),
  ([
    type,
    name,
    typeParams,
    equals,
    constructors,
  ]): TypeDefinitionExpression => ({
    kind: "type-definition",
    name: name.value,
    typeParams: typeParams.map((p: any) => p.value),
    constructors,
    location: createLocation(
      type.location.start,
      constructors[constructors.length - 1]?.location.end || equals.location.end
    ),
  })
);

// --- Constraint Function ---
const parseConstraintFunction: C.Parser<ConstraintFunction> = C.map(
  C.seq(
    C.identifier(),
    C.many(C.identifier()), // type parameters like "a b" in "bind a b"
    C.operator(":"),
    C.lazy(() => parseTypeExpression)
  ),
  ([name, typeParams, colon, type]): ConstraintFunction => ({
    name: name.value,
    typeParams: typeParams.map((p: any) => p.value),
    type,
    location: createLocation(name.location.start, colon.location.end),
  })
);

// --- Constraint Definition ---
const parseConstraintDefinition: C.Parser<ConstraintDefinitionExpression> = C.map(
  C.seq(
    C.keyword("constraint"),
    C.identifier(), // constraint name like "Monad"
    C.identifier(), // type parameter like "m"
    C.punctuation("("),
    C.sepBy(parseConstraintFunction, C.punctuation(";")),
    C.punctuation(")")
  ),
  ([constraintKeyword, name, typeParam, openParen, functions, closeParen]): ConstraintDefinitionExpression => ({
    kind: "constraint-definition",
    name: name.value,
    typeParam: typeParam.value,
    functions,
    location: createLocation(constraintKeyword.location.start, closeParen.location.end),
  })
);

// --- Implementation Function ---
const parseImplementationFunction: C.Parser<ImplementationFunction> = C.map(
  C.seq(
    C.identifier(),
    C.operator("="),
    C.lazy(() => parseSequenceTerm)
  ),
  ([name, equals, value]): ImplementationFunction => ({
    name: name.value,
    value,
    location: createLocation(name.location.start, value.location.end),
  })
);

// --- Implement Definition ---
const parseImplementDefinition: C.Parser<ImplementDefinitionExpression> = C.map(
  C.seq(
    C.keyword("implement"),
    C.identifier(), // constraint name like "Monad"
    C.identifier(), // type name like "List"
    C.punctuation("("),
    C.sepBy(parseImplementationFunction, C.punctuation(";")),
    C.punctuation(")")
  ),
  ([implementKeyword, constraintName, typeName, openParen, implementations, closeParen]): ImplementDefinitionExpression => ({
    kind: "implement-definition",
    constraintName: constraintName.value,
    typeName: typeName.value,
    implementations,
    location: createLocation(implementKeyword.location.start, closeParen.location.end),
  })
);

// --- Pattern Parsing ---
// Basic pattern parsing for constructor arguments (no nested constructors with args)
const parseBasicPattern: C.Parser<Pattern> = C.choice(
  // Wildcard pattern: _
  C.map(
    C.punctuation("_"),
    (underscore): Pattern => ({
      kind: "wildcard",
      location: underscore.location,
    })
  ),
  // Literal pattern: number or string
  C.map(
    C.number(),
    (num): Pattern => ({
      kind: "literal",
      value: parseInt(num.value),
      location: num.location,
    })
  ),
  C.map(
    C.string(),
    (str): Pattern => ({
      kind: "literal",
      value: str.value,
      location: str.location,
    })
  ),
  // Constructor or variable pattern: identifier (decide based on capitalization)
  C.map(C.identifier(), (name): Pattern => {
    // If identifier starts with uppercase, treat as constructor pattern (zero args)
    if (name.value.length > 0 && name.value[0] >= "A" && name.value[0] <= "Z") {
      return {
        kind: "constructor",
        name: name.value,
        args: [],
        location: name.location,
      };
    } else {
      // Otherwise, treat as variable pattern
      return {
        kind: "variable",
        name: name.value,
        location: name.location,
      };
    }
  })
);

const parsePattern: C.Parser<Pattern> = C.choice(
  // Wildcard pattern: _
  C.map(
    C.punctuation("_"),
    (underscore): Pattern => ({
      kind: "wildcard",
      location: underscore.location,
    })
  ),
  // Constructor pattern with arguments: Some x y
  C.map(
    C.seq(C.identifier(), C.many1(parseBasicPattern)),
    ([name, args]): Pattern => ({
      kind: "constructor",
      name: name.value,
      args,
      location: createLocation(
        name.location.start,
        args[args.length - 1].location.end
      ),
    })
  ),
  // Constructor pattern with parenthesized arguments: Wrap (Value n)
  C.map(
    C.seq(
      C.identifier(),
      C.punctuation("("),
      C.lazy(() => parsePattern),
      C.punctuation(")")
    ),
    ([name, openParen, arg, closeParen]): Pattern => ({
      kind: "constructor",
      name: name.value,
      args: [arg],
      location: createLocation(name.location.start, closeParen.location.end),
    })
  ),
  // Constructor or variable pattern: identifier (decide based on capitalization)
  C.map(C.identifier(), (name): Pattern => {
    // If identifier starts with uppercase, treat as constructor pattern
    if (name.value.length > 0 && name.value[0] >= "A" && name.value[0] <= "Z") {
      return {
        kind: "constructor",
        name: name.value,
        args: [],
        location: name.location,
      };
    } else {
      // Otherwise, treat as variable pattern
      return {
        kind: "variable",
        name: name.value,
        location: name.location,
      };
    }
  })
);

// --- Match Case ---
const parseMatchCase: C.Parser<MatchCase> = C.map(
  C.seq(
    parsePattern,
    C.operator("=>"),
    C.lazy(() => parseSequenceTermWithIfExceptRecord)
  ),
  ([pattern, arrow, expression]): MatchCase => ({
    pattern,
    expression,
    location: createLocation(pattern.location.start, expression.location.end),
  })
);

// --- Match Expression ---
const parseMatchExpression: C.Parser<MatchExpression> = C.map(
  C.seq(
    C.keyword("match"),
    C.lazy(() => parseSequenceTermWithIfExceptRecord),
    C.keyword("with"),
    C.punctuation("("),
    C.sepBy(parseMatchCase, C.punctuation(";")),
    C.punctuation(")")
  ),
  ([
    match,
    expression,
    with_,
    openParen,
    cases,
    closeParen,
  ]): MatchExpression => ({
    kind: "match",
    expression,
    cases,
    location: createLocation(match.location.start, closeParen.location.end),
  })
);

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
  parseConstraintDefinition, // constraint definitions
  parseImplementDefinition, // implement definitions
  parseTypeDefinition, // ADT type definitions
  parseMatchExpression, // ADT pattern matching
  parseDefinitionWithType, // allow definitions with type annotations
  parseDefinition, // fallback to regular definitions
  parseMutableDefinition,
  parseMutation,
  parseWhereExpression,
  parseImportExpression,
  parseIfAfterDollar, // if expressions with postfix support
  parseDollar, // full expression hierarchy (includes all primaries and type annotations)
  parseRecord,
  parseThrush,
  parseLambdaExpression
);

// Version without records to avoid circular dependency
const parseSequenceTermExceptRecord: C.Parser<Expression> = C.choice(
  parseConstraintDefinition, // constraint definitions
  parseImplementDefinition, // implement definitions
  parseTypeDefinition, // ADT type definitions
  parseMatchExpression, // ADT pattern matching
  parseDefinition,
  parseMutableDefinition,
  parseMutation,
  parseImportExpression,
  parseThrush,
  parseLambdaExpression,
  parseNumber,
  parseString,
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

// --- Parse atomic constraint ---
const parseAtomicConstraint: C.Parser<ConstraintExpr> = C.choice(
  // Parenthesized constraint
  C.map(
    C.seq(
      C.punctuation("("),
      C.lazy(() => parseConstraintExpr),
      C.punctuation(")")
    ),
    ([open, expr, close]) => ({ kind: "paren", expr })
  ),
  // a is Collection
  C.map(
    C.seq(
      C.identifier(),
      C.keyword("is"),
      C.choice(
        C.identifier()
        // Removed meaningless constraint keywords
      )
    ),
    ([typeVar, isKeyword, constraint]): ConstraintExpr => ({
      kind: "is",
      typeVar: typeVar.value,
      constraint: constraint.value,
    })
  ),
  // a has field "name" of type T
  C.map(
    C.seq(
      C.identifier(),
      C.keyword("has"),
      C.keyword("field"),
      C.string(),
      C.keyword("of"),
      C.keyword("type"),
      C.lazy(() => parseTypeExpression)
    ),
    ([
      typeVar,
      has,
      field,
      fieldName,
      of,
      type,
      fieldType,
    ]): ConstraintExpr => ({
      kind: "hasField",
      typeVar: typeVar.value,
      field: fieldName.value,
      fieldType,
    })
  ),
  // a implements Interface
  C.map(
    C.seq(C.identifier(), C.keyword("implements"), C.identifier()),
    ([typeVar, implementsKeyword, interfaceName]): ConstraintExpr => ({
      kind: "implements",
      typeVar: typeVar.value,
      interfaceName: interfaceName.value,
    })
  )
);

// --- Parse constraint expression with precedence: and > or ---
const parseConstraintExpr: C.Parser<ConstraintExpr> = (tokens) => {
  // Parse left side (and chains)
  let leftResult = parseConstraintAnd(tokens);
  if (!leftResult.success) return leftResult;
  let left = leftResult.value;
  let rest = leftResult.remaining;

  // Parse or chains
  while (
    rest.length > 0 &&
    rest[0].type === "KEYWORD" &&
    rest[0].value === "or"
  ) {
    rest = rest.slice(1);
    const rightResult = parseConstraintAnd(rest);
    if (!rightResult.success) return rightResult;
    left = { kind: "or", left, right: rightResult.value };
    rest = rightResult.remaining;
  }
  return { success: true as const, value: left, remaining: rest };
};

const parseConstraintAnd: C.Parser<ConstraintExpr> = (tokens) => {
  let leftResult = parseAtomicConstraint(tokens);
  if (!leftResult.success) return leftResult;
  let left = leftResult.value;
  let rest = leftResult.remaining;

  while (
    rest.length > 0 &&
    rest[0].type === "KEYWORD" &&
    rest[0].value === "and"
  ) {
    rest = rest.slice(1);
    const rightResult = parseAtomicConstraint(rest);
    if (!rightResult.success) return rightResult;
    left = { kind: "and", left, right: rightResult.value };
    rest = rightResult.remaining;
  }
  return { success: true as const, value: left, remaining: rest };
};

// --- Expression with type annotation (just above semicolon) ---
const parseExprWithType: C.Parser<Expression> = C.choice(
  // Expression with type and constraints: expr : type given constraintExpr
  C.map(
    C.seq(
      parseDollar, // Use parseDollar to support full expression hierarchy
      C.punctuation(":"),
      C.lazy(() => parseTypeExpression),
      C.keyword("given"),
      parseConstraintExpr
    ),
    ([expr, colon, type, given, constraint]): ConstrainedExpression => ({
      kind: "constrained",
      expression: expr,
      type,
      constraint,
      location: expr.location,
    })
  ),
  // Expression with just type: expr : type
  C.map(
    C.seq(
      parseDollar, // Use parseDollar to support full expression hierarchy
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
  parseDollar // Fallback to regular expressions
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
    const result = parseExpr(rest);
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
