import type { Token } from '../lexer/lexer';
import {
	PipelineExpression,
	type Expression,
	type Program,
	type LiteralExpression,
	type VariableExpression,
	type FunctionExpression,
	createLocation,
	type DefinitionExpression,
	type TupleDestructuringExpression,
	type RecordDestructuringExpression,
	type TupleDestructuringPattern,
	type RecordDestructuringPattern,
	type DestructuringElement,
	type RecordDestructuringField,
	type MutableDefinitionExpression,
	type ImportExpression,
	type AccessorExpression,
	type TypedExpression,
	type ConstrainedExpression,
	type ListExpression,
	type WhereExpression,
	type MatchExpression,
	type Pattern,
	type MatchCase,
	type UnitExpression,
	type RecordExpression,
	type TupleExpression,
	type ConstraintDefinitionExpression,
	type ImplementDefinitionExpression,
	type ConstraintFunction,
	type ImplementationFunction,
	type MutationExpression,
} from '../ast';
import {
	parseTypeDefinition,
	parseUserDefinedType,
	parseTypeExpression,
	parseConstraintExpr,
} from './parse-type';
import * as C from './combinators';

// --- Smaller focused type parsers ---

// --- Basic Parsers ---
const parseIdentifier = C.map(
	C.identifier(),
	(token): VariableExpression => ({
		kind: 'variable',
		name: token.value,
		location: token.location,
	})
);

const parseNumber = C.map(
	C.number(),
	(token): LiteralExpression => ({
		kind: 'literal',
		value: parseFloat(token.value),
		location: token.location,
		// Store original token for distinguishing 1 vs 1.0
		originalToken: token.value,
	})
);

const parseString = C.map(
	C.string(),
	(token): LiteralExpression => ({
		kind: 'literal',
		value: token.value,
		location: token.location,
	})
);

const parseAccessor = C.map(
	C.accessor(),
	(token): AccessorExpression => ({
		kind: 'accessor',
		field: token.value.endsWith('?') ? token.value.slice(0, -1) : token.value,
		optional: token.value.endsWith('?'),
		location: token.location,
	})
);

// --- Record Parsing ---
const parseRecordFieldName = C.map(
	C.accessor(),
	token => (token.value.endsWith('?') ? token.value.slice(0, -1) : token.value) // Just get the field name without @ and without optional marker
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
	tokens => {
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
			error: 'Expected record field (named or positional)',
			position: tokens[0]?.location.start.line || 0,
		};
	};

// Custom parser for a sequence of fields separated by semicolons
const parseRecordFields: C.Parser<
	{ name: string; value: Expression }[]
> = tokens => {
	const fields: { name: string; value: Expression; isNamed: boolean }[] = [];
	let rest = tokens;
	// Parse first field
	const firstFieldResult = parseRecordFieldOrPositional(0)(rest);
	if (!firstFieldResult.success) {
		return {
			success: false,
			error: 'Expected at least one record field',
			position: tokens[0]?.location.start.line || 0,
		};
	}
	fields.push(firstFieldResult.value);
	rest = firstFieldResult.remaining;
	const isNamed = firstFieldResult.value.isNamed;
	// Parse additional fields, each preceded by a comma
	while (rest.length > 0) {
		const commaResult = C.punctuation(',')(rest);
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
				rest[0].type === 'PUNCTUATION' &&
				rest[0].value === '}'
			) {
				// This is a trailing comma, which is allowed
				break;
			}
			return {
				success: false,
				error: 'Expected field after comma',
				position: rest[0]?.location.start.line || 0,
			};
		}
		if (fieldResult.value.isNamed !== isNamed) {
			return {
				success: false,
				error:
					'Cannot mix named and positional fields in the same record/tuple',
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
	C.seq(C.punctuation('{'), C.optional(parseRecordFields), C.punctuation('}')),
	([open, fields, _close]): Expression => {
		const fieldsList = fields || [];
		if (fieldsList.length === 0) {
			// Empty braces: unit
			return {
				kind: 'unit',
				location: open.location,
			} as UnitExpression;
		}
		const allNamed = fieldsList.every(f => f.name[0] !== '@');
		const allPositional = fieldsList.every((f, i) => f.name === `@${i}`);
		if (allNamed) {
			// All named fields: record
			return {
				kind: 'record',
				fields: fieldsList,
				location: open.location,
			} as RecordExpression;
		} else if (allPositional) {
			// All positional fields: tuple
			return {
				kind: 'tuple',
				elements: fieldsList.map(f => f.value),
				location: open.location,
			} as TupleExpression;
		} else {
			// Mixed fields: error
			throw new Error(
				'Cannot mix named and positional fields in the same record/tuple'
			);
		}
	}
);

// --- Parenthesized Expressions ---
const parseParenExpr: C.Parser<Expression> = C.map(
	C.seq(
		C.punctuation('('),
		C.lazy(() => parseSequence), // Use parseSequence to allow full semicolon-separated sequences
		C.punctuation(')')
	),
	([_open, expr, _close]) => expr
);

// --- Lambda Expression ---
const parseLambdaExpression: C.Parser<Expression> = tokens => {
	// Try to parse fn keyword first
	const fnResult = C.keyword('fn')(tokens);
	if (!fnResult.success) {
		return fnResult;
	}

	// Try unit parameter patterns first
	let paramNames: string[] = [];
	let remaining = fnResult.remaining;

	const parenResult = C.seq(C.punctuation('('), C.punctuation(')'))(remaining);
	if (parenResult.success) {
		// No parameters (should not be used in Noolang, but keep for syntax completeness)
		paramNames = [];
		remaining = parenResult.remaining;
	} else {
		const braceResult = C.seq(
			C.punctuation('{'),
			C.punctuation('}')
		)(remaining);
		if (braceResult.success) {
			// Unit parameter
			paramNames = ['_unit'];
			remaining = braceResult.remaining;
		} else {
			// Try multiple identifiers last
			const idResult = C.many(C.identifier())(remaining);
			if (idResult.success) {
				paramNames = idResult.value.map(p => p.value);
				remaining = idResult.remaining;
			} else {
				return {
					success: false,
					error: 'Expected parameter list, parentheses, or braces',
					position: remaining[0]?.location.start.line || 0,
				};
			}
		}
	}

	// Parse the arrow
	const arrowResult = C.operator('=>')(remaining);
	if (!arrowResult.success) {
		return arrowResult;
	}

	const bodyResult = parseLambdaBody(arrowResult.remaining);
	if (!bodyResult.success) {
		return bodyResult;
	}

	const lambda: FunctionExpression = {
		kind: 'function',
		params: paramNames,
		body: bodyResult.value,
		location: fnResult.value.location,
	};

	return { success: true, value: lambda, remaining: bodyResult.remaining };
};

// --- Lambda Body Parser ---
const parseLambdaBody: C.Parser<Expression> = tokens => {
	// Handle complex expressions that start with keywords
	const complexResult = C.choice(
		parseMatchExpression,
		parseTypeDefinition,
		parseUserDefinedType,
		parseConstraintDefinition,
		parseImplementDefinition,
		parseMutableDefinition,
		parseMutation,
		parseImportExpression,
		parseIfExpression,
		parseDefinition,
		parseWhereExpression
	)(tokens);

	if (complexResult.success) {
		return complexResult;
	}
	return parseLambdaBodyThrush(tokens);
};

const parseLambdaBodyDollar: C.Parser<Expression> = tokens => {
	const leftResult = parseLambdaBodyCompose(tokens);
	if (!leftResult.success) return leftResult;

	if (
		leftResult.remaining.length > 0 &&
		leftResult.remaining[0].type === 'OPERATOR' &&
		leftResult.remaining[0].value === '$'
	) {
		const remaining = leftResult.remaining.slice(1);
		const rightResult = parseLambdaBodyDollar(remaining);
		if (!rightResult.success) return rightResult;

		return {
			success: true as const,
			value: {
				kind: 'binary' as const,
				operator: '$' as const,
				left: leftResult.value,
				right: rightResult.value,
				location: leftResult.value.location,
			},
			remaining: rightResult.remaining,
		};
	}
	return leftResult;
};

// Simplified parsing hierarchy for lambda bodies
const parseLambdaBodyThrush: C.Parser<Expression> = C.map(
	C.seq(
		parseLambdaBodyDollar,
		C.many(
			C.seq(C.choice2(C.operator('|'), C.operator('|?')), parseLambdaBodyDollar)
		)
	),
	([left, rest]) => {
		let result = left;
		for (const [op, right] of rest) {
			result = {
				kind: 'binary',
				operator: op.value as '|' | '|?',
				left: result,
				right,
				location: result.location,
			};
		}
		return result;
	}
);

const parseLambdaBodyComparison: C.Parser<Expression> = tokens => {
	return C.map(
		C.seq(
			parseLambdaBodyAdditive,
			C.many(
				C.seq(
					C.choice(
						C.operator('<'),
						C.operator('>'),
						C.operator('<='),
						C.operator('>='),
						C.operator('=='),
						C.operator('!=')
					),
					parseLambdaBodyAdditive
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
					location: result.location,
				};
			}
			return result;
		}
	)(tokens);
};

const parseLambdaBodyCompose: C.Parser<Expression> = C.map(
	C.seq(
		parseLambdaBodyComparison,
		C.many(
			C.seq(
				C.choice2(C.operator('|>'), C.operator('<|')),
				parseLambdaBodyComparison
			)
		)
	),
	([left, rest]) => {
		const steps = [left];
		const operators: ('|>' | '<|')[] = [];
		for (const [op, right] of rest) {
			operators.push(op.value as '|>' | '<|');
			steps.push(right);
		}

		if (steps.length > 1) {
			return {
				kind: 'pipeline',
				steps,
				operators,
				location: left.location,
			} as PipelineExpression;
		}
		return left;
	}
);

const parseLambdaBodyMultiplicative: C.Parser<Expression> = tokens => {
	return C.map(
		C.seq(
			parseLambdaBodyApplication,
			C.many(
				C.seq(
					C.choice3(C.operator('*'), C.operator('/'), C.operator('%')),
					parseLambdaBodyApplication
				)
			)
		),
		([left, rest]) => {
			let result = left;
			for (const [op, right] of rest) {
				result = {
					kind: 'binary',
					operator: op.value as '*' | '/' | '%',
					left: result,
					right,
					location: result.location,
				};
			}
			return result;
		}
	)(tokens);
};

const parseLambdaBodyAdditive: C.Parser<Expression> = C.map(
	C.seq(
		parseLambdaBodyMultiplicative,
		C.many(
			C.seq(
				C.choice2(C.operator('+'), C.operator('-')),
				parseLambdaBodyMultiplicative
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
				location: result.location,
			};
		}
		return result;
	}
);

const parseLambdaBodyUnary: C.Parser<Expression> = tokens => {
	if (
		tokens.length >= 2 &&
		tokens[0].type === 'OPERATOR' &&
		tokens[0].value === '-'
	) {
		const minusToken = tokens[0];
		const nextToken = tokens[1];
		if (
			minusToken.location.end.line === nextToken.location.start.line &&
			minusToken.location.end.column === nextToken.location.start.column
		) {
			const operandResult = parsePrimary(tokens.slice(1));
			if (!operandResult.success) return operandResult;

			return {
				success: true as const,
				value: {
					kind: 'binary' as const,
					operator: '*' as const,
					left: {
						kind: 'literal' as const,
						value: -1,
						location: minusToken.location,
					},
					right: operandResult.value,
					location: minusToken.location,
				},
				remaining: operandResult.remaining,
			};
		}
	}
	return parsePrimary(tokens);
};

const parseLambdaBodyApplication: C.Parser<Expression> = C.map(
	C.seq(parseLambdaBodyUnary, C.many(parseLambdaBodyUnary)),
	([func, args]) => {
		let result = func;
		for (const arg of args) {
			result = {
				kind: 'application',
				func: result,
				args: [arg],
				location: result.location,
			};
		}
		return result;
	}
);

// --- List Parsing ---
// Custom parser for a sequence of expressions separated by semicolons
const parseListElements: C.Parser<Expression[]> = tokens => {
	const elements: Expression[] = [];
	let rest = tokens;

	// Parse first element
	const firstElementResult = C.lazy(() => parseThrush)(rest);
	if (!firstElementResult.success) {
		return {
			success: false,
			error: 'Expected at least one list element',
			position: tokens[0]?.location.start.line || 0,
		};
	}
	elements.push(firstElementResult.value);
	rest = firstElementResult.remaining;

	// Parse additional elements, each preceded by a comma
	while (rest.length > 0) {
		const commaResult = C.punctuation(',')(rest);
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
				rest[0].type === 'PUNCTUATION' &&
				rest[0].value === ']'
			) {
				// This is a trailing comma, which is allowed
				break;
			}
			return {
				success: false,
				error: 'Expected element after comma',
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
	C.seq(C.punctuation('['), C.optional(parseListElements), C.punctuation(']')),
	([open, elements, _close]) => {
		const elementsList: Expression[] = elements || [];
		return {
			kind: 'list',
			elements: elementsList,
			location: open.location,
		};
	}
);

// --- Import Expression ---
const parseImportExpression: C.Parser<ImportExpression> = C.map(
	C.seq(C.keyword('import'), C.string()),
	([importKw, path]): ImportExpression => ({
		kind: 'import',
		path: path.value,
		location: importKw.location,
	})
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
	([ifKw, condition, _thenKw, thenExpr, _elseKw, elseExpr]) => {
		return {
			kind: 'if',
			condition,
			then: thenExpr,
			else: elseExpr,
			location: ifKw.location,
		};
	}
);

// --- Primary Expressions (no unary minus) ---
const parsePrimary: C.Parser<Expression> = tokens => {
	if (tokens.length === 0) {
		return { success: false, error: 'Unexpected end of input', position: 0 };
	}

	const firstToken = tokens[0];

	// Dispatch based on token type and value for O(1) selection
	switch (firstToken.type) {
		case 'NUMBER':
			return parseNumber(tokens);
		case 'STRING':
			return parseString(tokens);
		case 'IDENTIFIER':
			return parseIdentifier(tokens);
		case 'ACCESSOR':
			return parseAccessor(tokens);
		case 'PUNCTUATION':
			if (firstToken.value === '[') {
				return parseList(tokens);
			} else if (firstToken.value === '{') {
				return parseRecord(tokens);
			} else if (firstToken.value === '(') {
				return parseParenExpr(tokens);
			} else {
				return {
					success: false,
					error: `Unexpected punctuation: ${firstToken.value}`,
					position: firstToken.location.start.line,
				};
			}
		case 'KEYWORD':
			if (firstToken.value === 'fn') {
				return parseLambdaExpression(tokens);
			} else if (firstToken.value === 'let') {
				return C.lazy(() => parseDefinition)(tokens);
			} else if (firstToken.value === 'import') {
				return parseImportExpression(tokens);
			} else {
				return {
					success: false,
					error: `Unexpected keyword: ${firstToken.value}`,
					position: firstToken.location.start.line,
				};
			}
		default:
			return {
				success: false,
				error: `Unexpected token type: ${firstToken.type}`,
				position: firstToken.location.start.line,
			};
	}
};

// --- Unary Operators (negation, only if '-' is adjacent to the next token) ---
const parseUnary: C.Parser<Expression> = tokens => {
	if (
		tokens.length >= 2 &&
		tokens[0].type === 'OPERATOR' &&
		tokens[0].value === '-'
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
					kind: 'binary',
					operator: '*',
					left: {
						kind: 'literal',
						value: -1,
						location: minusToken.location,
					},
					right: operandResult.value,
					location: minusToken.location,
				},
				remaining: operandResult.remaining,
			} as const;
		}
	}
	return parsePrimary(tokens);
};

// --- Function Application (left-associative, tightest binding) ---
const parseApplication: C.Parser<Expression> = C.map(
	C.seq(parseUnary, C.many(parseUnary)),
	([func, args]) => {
		let result = func;
		for (const arg of args) {
			result = {
				kind: 'application',
				func: result,
				args: [arg],
				location: result.location,
			};
		}
		return result;
	}
);

// --- Multiplicative (*, /, %) ---
const parseMultiplicative: C.Parser<Expression> = C.map(
	C.seq(
		parseApplication,
		C.many(
			C.seq(
				C.choice3(C.operator('*'), C.operator('/'), C.operator('%')),
				parseApplication
			)
		)
	),
	([left, rest]) => {
		let result = left;
		for (const [op, right] of rest) {
			result = {
				kind: 'binary',
				operator: op.value as '*' | '/' | '%',
				left: result,
				right,
				location: result.location,
			};
		}
		return result;
	}
);

// --- Additive (+, -) ---
const parseAdditive: C.Parser<Expression> = tokens => {
	const addResult = C.map(
		C.seq(
			parseMultiplicative,
			C.many(
				C.seq(C.choice2(C.operator('+'), C.operator('-')), parseMultiplicative)
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
					location: result.location,
				};
			}
			return result;
		}
	)(tokens);

	return addResult;
};

// --- Comparison (<, >, <=, >=, ==, !=) ---
const parseComparison: C.Parser<Expression> = tokens => {
	const compResult = C.map(
		C.seq(
			parseAdditive,
			C.many(
				C.seq(
					C.choice(
						C.operator('<'),
						C.operator('>'),
						C.operator('<='),
						C.operator('>='),
						C.operator('=='),
						C.operator('!=')
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
					location: result.location,
				};
			}
			return result;
		}
	)(tokens);

	return compResult;
};

// --- Composition (|>, <|) ---
const parseCompose: C.Parser<Expression> = tokens => {
	const compResult = C.map(
		C.seq(
			parseComparison,
			C.many(
				C.seq(C.choice2(C.operator('|>'), C.operator('<|')), parseComparison)
			)
		),
		([left, rest]) => {
			// Build steps array for pipeline expression
			const steps = [left];
			const operators: ('|>' | '<|')[] = [];
			for (const [op, right] of rest) {
				operators.push(op.value as '|>' | '<|');
				steps.push(right);
			}

			// If we have multiple steps, create a pipeline expression
			if (steps.length > 1) {
				const result: PipelineExpression = {
					kind: 'pipeline',
					steps,
					operators,
					location: left.location,
				};
				return result;
			}

			// Otherwise just return the single expression
			return left;
		}
	)(tokens);

	return compResult;
};

// --- Thrush (|) and Safe Thrush (|?) ---
const parseThrush: C.Parser<Expression> = tokens => {
	const thrushResult = C.map(
		C.seq(
			parseDollar,
			C.many(C.seq(C.choice2(C.operator('|'), C.operator('|?')), parseDollar))
		),
		([left, rest]) => {
			let result = left;
			for (const [op, right] of rest) {
				result = {
					kind: 'binary',
					operator: op.value as '|' | '|?',
					left: result,
					right,
					location: result.location,
				};
			}
			return result;
		}
	)(tokens);

	return thrushResult;
};

// --- Dollar ($) - Low precedence function application (right-associative) ---
const parseDollar: C.Parser<Expression> = tokens => {
	const leftResult = parseCompose(tokens);
	if (!leftResult.success) return leftResult;

	// Check for $ operator
	if (
		leftResult.remaining.length > 0 &&
		leftResult.remaining[0].type === 'OPERATOR' &&
		leftResult.remaining[0].value === '$'
	) {
		// Consume the $ token
		const remaining = leftResult.remaining.slice(1);

		// Recursively parse the right side (this creates right-associativity)
		const rightResult = parseDollar(remaining);
		if (!rightResult.success) return rightResult;

		const result = {
			kind: 'binary' as const,
			operator: '$' as const,
			left: leftResult.value,
			right: rightResult.value,
			location: leftResult.value.location,
		};

		return { success: true, value: result, remaining: rightResult.remaining };
	}

	// No $ operator found, just return the left expression
	return leftResult;
};

// Helper function to apply postfix operators to an expression
// Parse type annotation with optional constraint: : Type [given Constraint]
const parseTypeAnnotation = C.map(
	C.seq(
		C.punctuation(':'),
		parseTypeExpression,
		C.optional(
			C.seq(
				C.keyword('given'),
				C.lazy(() => parseConstraintExpr)
			)
		)
	),
	([_colon, type, constraintClause]) => ({
		type,
		constraint: constraintClause ? constraintClause[1] : undefined,
	})
);

// --- Destructuring Element Parser ---
const parseDestructuringElement: C.Parser<DestructuringElement> = C.choice(
	C.map(
		C.identifier(),
		(name): DestructuringElement => ({
			kind: 'variable',
			name: name.value,
			location: name.location,
		})
	),
	C.map(
		C.lazy(() => parseTupleDestructuringPattern),
		(pattern): DestructuringElement => ({
			kind: 'nested-tuple',
			pattern,
			location: pattern.location,
		})
	),
	C.map(
		C.lazy(() => parseRecordDestructuringPattern),
		(pattern): DestructuringElement => ({
			kind: 'nested-record',
			pattern,
			location: pattern.location,
		})
	)
);

// --- Tuple Destructuring Pattern Parser ---
const parseTupleDestructuringPattern: C.Parser<TupleDestructuringPattern> =
	C.map(
		C.seq(
			C.punctuation('{'),
			C.sepBy(parseDestructuringElement, C.punctuation(',')),
			C.punctuation('}')
		),
		([openBrace, elements, _closeBrace]): TupleDestructuringPattern => ({
			kind: 'tuple-destructuring-pattern',
			elements,
			location: openBrace.location,
		})
	);

// --- Record Destructuring Field Parser ---
const parseRecordDestructuringField: C.Parser<RecordDestructuringField> =
	C.choice(
		// {@field localName} - rename
		C.map(
			C.seq(C.accessor(), C.identifier()),
			([accessor, localName]): RecordDestructuringField => ({
				kind: 'rename',
				fieldName: accessor.value,
				localName: localName.value,
				location: accessor.location,
			})
		),
		// {@field {x, y}} - nested tuple
		C.map(
			C.seq(C.accessor(), parseTupleDestructuringPattern),
			([accessor, pattern]): RecordDestructuringField => ({
				kind: 'nested-tuple',
				fieldName: accessor.value,
				pattern,
				location: accessor.location,
			})
		),
		// {@field {@nested}} - nested record
		C.map(
			C.seq(
				C.accessor(),
				C.lazy(() => parseRecordDestructuringPattern)
			),
			([accessor, pattern]): RecordDestructuringField => ({
				kind: 'nested-record',
				fieldName: accessor.value,
				pattern,
				location: accessor.location,
			})
		),
		// {@field} - shorthand
		C.map(
			C.accessor(),
			(accessor): RecordDestructuringField => ({
				kind: 'shorthand',
				fieldName: accessor.value,
				location: accessor.location,
			})
		)
	);

// --- Record Destructuring Pattern Parser ---
const parseRecordDestructuringPattern: C.Parser<RecordDestructuringPattern> =
	C.map(
		C.seq(
			C.punctuation('{'),
			C.sepBy(parseRecordDestructuringField, C.punctuation(',')),
			C.punctuation('}')
		),
		([openBrace, fields, _closeBrace]): RecordDestructuringPattern => ({
			kind: 'record-destructuring-pattern',
			fields,
			location: openBrace.location,
		})
	);

// --- Lookahead to detect destructuring vs expression ---
const isDestructuringPattern = (tokens: Token[]): boolean => {
	if (tokens.length < 3) return false;
	if (tokens[0].type !== 'PUNCTUATION' || tokens[0].value !== '{') return false;

	let braceCount = 0;
	let i = 0;

	// Look for the closing brace and then an equals sign
	while (i < tokens.length) {
		const token = tokens[i];
		if (token.type === 'PUNCTUATION' && token.value === '{') {
			braceCount++;
		} else if (token.type === 'PUNCTUATION' && token.value === '}') {
			braceCount--;
			if (braceCount === 0) {
				// Found the closing brace, check if next token is '='
				if (
					i + 1 < tokens.length &&
					tokens[i + 1].type === 'OPERATOR' &&
					tokens[i + 1].value === '='
				) {
					return true;
				}
				return false;
			}
		}
		i++;
	}

	return false;
};

// --- Tuple Destructuring Expression Parser ---
export const parseTupleDestructuring: C.Parser<
	TupleDestructuringExpression
> = tokens => {
	if (!isDestructuringPattern(tokens)) {
		return {
			success: false,
			error: 'Not a destructuring pattern',
			position: 0,
		};
	}

	return C.map(
		C.seq(
			parseTupleDestructuringPattern,
			C.operator('='),
			C.lazy(() => parseSequenceTerm)
		),
		([pattern, _equals, value]): TupleDestructuringExpression => ({
			kind: 'tuple-destructuring',
			pattern,
			value,
			location: pattern.location,
		})
	)(tokens);
};

// --- Record Destructuring Expression Parser ---
export const parseRecordDestructuring: C.Parser<
	RecordDestructuringExpression
> = tokens => {
	if (!isDestructuringPattern(tokens)) {
		return {
			success: false,
			error: 'Not a destructuring pattern',
			position: 0,
		};
	}

	return C.map(
		C.seq(
			parseRecordDestructuringPattern,
			C.operator('='),
			C.lazy(() => parseSequenceTerm)
		),
		([pattern, _equals, value]): RecordDestructuringExpression => ({
			kind: 'record-destructuring',
			pattern,
			value,
			location: pattern.location,
		})
	)(tokens);
};

// --- Combined Definition Parser (handles regular definitions and destructuring) ---
const parseDefinition: C.Parser<Expression> = tokens => {
	// First try destructuring patterns
	if (isDestructuringPattern(tokens)) {
		// Try tuple destructuring first
		const tupleResult = parseTupleDestructuring(tokens);
		if (tupleResult.success) {
			return tupleResult;
		}
		// Try record destructuring
		const recordResult = parseRecordDestructuring(tokens);
		if (recordResult.success) {
			return recordResult;
		}
	}

	// Fallback to regular definition
	const regularResult = C.map(
		C.seq(
			C.identifier(),
			C.operator('='),
			C.lazy(() => parseSequenceTerm)
		),
		([name, _equals, value]): DefinitionExpression => {
			return {
				kind: 'definition',
				name: name.value,
				value,
				location: name.location,
			};
		}
	)(tokens);

	if (!regularResult.success) return regularResult;

	// Check for optional type annotation after the definition
	const remaining = regularResult.remaining;
	if (
		remaining.length > 0 &&
		remaining[0].type === 'PUNCTUATION' &&
		remaining[0].value === ':'
	) {
		// Parse the type annotation
		const typeResult = parseTypeAnnotation(remaining);
		if (typeResult.success) {
			// Modify the definition to have a typed value
			const originalDef = regularResult.value as DefinitionExpression;

			// Create typed value
			let typedValue: Expression;
			if (typeResult.value.constraint) {
				// Create constrained expression
				typedValue = {
					kind: 'constrained',
					expression: originalDef.value,
					type: typeResult.value.type,
					constraint: typeResult.value.constraint,
					location: originalDef.value.location,
				};
			} else {
				// Create typed expression
				typedValue = {
					kind: 'typed',
					expression: originalDef.value,
					type: typeResult.value.type,
					location: originalDef.value.location,
				};
			}

			// Create new definition with typed value
			const modifiedDef: DefinitionExpression = {
				kind: 'definition',
				name: originalDef.name,
				value: typedValue,
				location: originalDef.location,
			};

			return {
				success: true,
				value: modifiedDef,
				remaining: typeResult.remaining,
			};
		}
	}

	return regularResult;
};

// --- Mutable Definition ---
const parseMutableDefinition: C.Parser<MutableDefinitionExpression> = C.map(
	C.seq(
		C.keyword('mut'),
		C.identifier(),
		C.operator('='),
		C.lazy(() => parseSequenceTerm)
	),
	([mut, name, _equals, value]): MutableDefinitionExpression => {
		return {
			kind: 'mutable-definition',
			name: name.value,
			value,
			location: mut.location,
		};
	}
);

// --- Mutation ---
const parseMutation: C.Parser<MutationExpression> = C.map(
	C.seq(
		C.keyword('mut!'),
		C.identifier(),
		C.operator('='),
		C.lazy(() => parseSequenceTerm)
	),
	([mut, name, _equals, value]): MutationExpression => {
		return {
			kind: 'mutation',
			target: name.value,
			value,
			location: mut.location,
		};
	}
);

// Custom parser for where clause definitions (both regular and mutable)
const parseWhereDefinition: C.Parser<
	| DefinitionExpression
	| TupleDestructuringExpression
	| RecordDestructuringExpression
	| MutableDefinitionExpression
> = tokens => {
	// Try mutable definition first
	const mutableResult = parseMutableDefinition(tokens);
	if (mutableResult.success) {
		return mutableResult;
	}

	// Try destructuring patterns
	if (isDestructuringPattern(tokens)) {
		// Try tuple destructuring first
		const tupleResult = parseTupleDestructuring(tokens);
		if (tupleResult.success) {
			return tupleResult;
		}
		// Try record destructuring
		const recordResult = parseRecordDestructuring(tokens);
		if (recordResult.success) {
			return recordResult;
		}
	}

	// Fallback to regular definition
	const regularResult = C.map(
		C.seq(
			C.identifier(),
			C.operator('='),
			C.lazy(() => parseSequenceTerm)
		),
		([name, _equals, value]): DefinitionExpression => {
			return {
				kind: 'definition',
				name: name.value,
				value,
				location: name.location,
			};
		}
	)(tokens);

	if (regularResult.success) {
		return regularResult;
	}

	return {
		success: false,
		error: 'Expected definition in where clause',
		position: tokens[0]?.location.start.line || 0,
	};
};

// --- Constraint Function ---
const parseConstraintFunction: C.Parser<ConstraintFunction> = C.map(
	C.seq(
		C.identifier(),
		C.many(C.identifier()), // type parameters like "a b" in "bind a b"
		C.punctuation(':'),
		C.lazy(() => parseTypeExpression)
	),
	([name, typeParams, colon, type]): ConstraintFunction => {
		return {
			name: name.value,
			typeParams: typeParams.map(p => p.value),
			type,
			location: createLocation(name.location.start, colon.location.end),
		};
	}
);

// --- Constraint Definition ---
const parseConstraintDefinition: C.Parser<ConstraintDefinitionExpression> =
	C.map(
		C.seq(
			C.keyword('constraint'),
			C.identifier(), // constraint name like "Monad"
			C.many1(C.identifier()), // type parameters like "m" or "m a"
			C.punctuation('('),
			C.sepBy(parseConstraintFunction, C.punctuation(';')),
			C.punctuation(')')
		),
		([
			constraintKeyword,
			name,
			typeParams,
			_openParen,
			functions,
			closeParen,
		]): ConstraintDefinitionExpression => ({
			kind: 'constraint-definition',
			name: name.value,
			typeParams: typeParams.map(p => p.value),
			functions,
			location: createLocation(
				constraintKeyword.location.start,
				closeParen.location.end
			),
		})
	);

// --- Implementation Function ---
const parseImplementationFunction: C.Parser<ImplementationFunction> = C.map(
	C.seq(
		C.identifier(),
		C.operator('='),
		C.lazy(() => parseSequenceTerm)
	),
	([name, _equals, value]): ImplementationFunction => ({
		name: name.value,
		value,
		location: createLocation(name.location.start, value.location.end),
	})
);

// --- Implement Definition ---
const parseImplementDefinition: C.Parser<ImplementDefinitionExpression> = C.map(
	C.seq(
		C.keyword('implement'),
		C.identifier(), // constraint name like "Monad"
		C.lazy(() => parseTypeExpression), // type expression like "Option" or "(Result e)"
		// Optional given constraints
		C.optional(
			C.seq(
				C.keyword('given'),
				C.lazy(() => parseConstraintExpr)
			)
		),
		C.punctuation('('),
		C.sepBy(parseImplementationFunction, C.punctuation(';')),
		C.punctuation(')')
	),
	([
		implementKeyword,
		constraintName,
		typeExpr,
		givenClause,
		_openParen,
		implementations,
		closeParen,
	]): ImplementDefinitionExpression => ({
		kind: 'implement-definition',
		constraintName: constraintName.value,
		typeExpr,
		givenConstraints: givenClause ? givenClause[1] : undefined,
		implementations,
		location: createLocation(
			implementKeyword.location.start,
			closeParen.location.end
		),
	})
);

// --- Pattern Parsing ---
// Basic pattern parsing for constructor arguments (no nested constructors with args)
const parseBasicPattern: C.Parser<Pattern> = C.choice(
	// Wildcard pattern: _
	C.map(
		C.punctuation('_'),
		(underscore): Pattern => ({
			kind: 'wildcard',
			location: underscore.location,
		})
	),
	// Literal pattern: number or string
	C.map(
		C.number(),
		(num): Pattern => ({
			kind: 'literal',
			value: parseInt(num.value),
			location: num.location,
		})
	),
	C.map(
		C.string(),
		(str): Pattern => ({
			kind: 'literal',
			value: str.value,
			location: str.location,
		})
	),
	// Constructor or variable pattern: identifier (decide based on capitalization)
	C.map(C.identifier(), (name): Pattern => {
		// If identifier starts with uppercase, treat as constructor pattern (zero args)
		if (name.value.length > 0 && name.value[0] >= 'A' && name.value[0] <= 'Z') {
			return {
				kind: 'constructor',
				name: name.value,
				args: [],
				location: name.location,
			};
		} else {
			// Otherwise, treat as variable pattern
			return {
				kind: 'variable',
				name: name.value,
				location: name.location,
			};
		}
	})
);

// --- Tuple/Record Pattern Parsing ---
const parsePatternFieldOrElement = (
	index: number
): C.Parser<{ isRecord: boolean; fieldName?: string; pattern: Pattern }> => {
	// Try record field pattern first: @field pattern
	const recordFieldResult = C.seq(
		C.accessor(),
		C.lazy(() => parsePattern)
	);

	return (
		tokens: Token[]
	): C.ParseResult<{
		isRecord: boolean;
		fieldName?: string;
		pattern: Pattern;
	}> => {
		const result = recordFieldResult(tokens);
		if (result.success) {
			const [accessor, pattern] = result.value;
			return {
				success: true,
				value: {
					isRecord: true,
					fieldName: accessor.value, // Accessor value already excludes the @ prefix
					pattern,
				},
				remaining: result.remaining,
			};
		}

		// Try tuple element pattern: pattern
		const elementResult = C.lazy(() => parsePattern)(tokens);
		if (elementResult.success) {
			return {
				success: true,
				value: {
					isRecord: false,
					fieldName: `@${index}`, // Create positional field name for tuple elements
					pattern: elementResult.value,
				},
				remaining: elementResult.remaining,
			};
		}

		return {
			success: false,
			error: `Expected pattern or @field pattern at position ${index}`,
			position: tokens[0]?.location.start.line || 0,
		};
	};
};

const parsePatternFields: C.Parser<
	{ isRecord: boolean; fieldName?: string; pattern: Pattern }[]
> = (
	tokens: Token[]
): C.ParseResult<
	{ isRecord: boolean; fieldName?: string; pattern: Pattern }[]
> => {
	const fields: { isRecord: boolean; fieldName?: string; pattern: Pattern }[] =
		[];
	let rest = tokens;

	// Parse first field/element
	const firstResult = parsePatternFieldOrElement(0)(rest);
	if (!firstResult.success) {
		return firstResult;
	}

	fields.push(firstResult.value);
	rest = firstResult.remaining;

	// Parse remaining fields/elements with comma separators
	while (
		rest.length > 0 &&
		rest[0].type === 'PUNCTUATION' &&
		rest[0].value === ','
	) {
		rest = rest.slice(1); // consume comma

		const fieldResult = parsePatternFieldOrElement(fields.length)(rest);
		if (!fieldResult.success) {
			break;
		}

		fields.push(fieldResult.value);
		rest = fieldResult.remaining;
	}

	return {
		success: true,
		value: fields,
		remaining: rest,
	};
};

const parseTupleOrRecordPattern: C.Parser<Pattern> = C.map(
	C.seq(C.punctuation('{'), C.optional(parsePatternFields), C.punctuation('}')),
	([open, fields, close]): Pattern => {
		const fieldsList = fields || [];

		if (fieldsList.length === 0) {
			// Empty braces - this could be unit pattern, but for now treat as empty tuple
			return {
				kind: 'tuple',
				elements: [],
				location: createLocation(open.location.start, close.location.end),
			};
		}

		// Check if all fields are record fields or all are tuple elements
		const allRecord = fieldsList.every(f => f.isRecord);
		const allTuple = fieldsList.every(f => !f.isRecord);

		if (allRecord) {
			// Record pattern
			return {
				kind: 'record',
				fields: fieldsList.map(f => ({
					fieldName: f.fieldName!,
					pattern: f.pattern,
					location: f.pattern.location,
				})),
				location: createLocation(open.location.start, close.location.end),
			};
		} else if (allTuple) {
			// Tuple pattern
			return {
				kind: 'tuple',
				elements: fieldsList.map(f => f.pattern),
				location: createLocation(open.location.start, close.location.end),
			};
		} else {
			// Mixed - error
			throw new Error(
				'Cannot mix record fields (@field) and tuple elements in the same pattern'
			);
		}
	}
);

const parsePattern: C.Parser<Pattern> = C.choice(
	// Wildcard pattern: _
	C.map(
		C.punctuation('_'),
		(underscore): Pattern => ({
			kind: 'wildcard',
			location: underscore.location,
		})
	),
	// Literal pattern: number
	C.map(
		C.number(),
		(num): Pattern => ({
			kind: 'literal',
			value: parseInt(num.value),
			location: num.location,
		})
	),
	// Literal pattern: string
	C.map(
		C.string(),
		(str): Pattern => ({
			kind: 'literal',
			value: str.value,
			location: str.location,
		})
	),
	// Tuple/Record pattern: {pattern, pattern} or {@field pattern, @field pattern}
	parseTupleOrRecordPattern,
	// Constructor pattern with tuple/record argument: Some {x, y}
	C.map(
		C.seq(C.identifier(), parseTupleOrRecordPattern),
		([name, tupleOrRecordPattern]): Pattern => ({
			kind: 'constructor',
			name: name.value,
			args: [tupleOrRecordPattern],
			location: createLocation(
				name.location.start,
				tupleOrRecordPattern.location.end
			),
		})
	),
	// Constructor pattern with arguments: Some x y
	C.map(
		C.seq(C.identifier(), C.many1(parseBasicPattern)),
		([name, args]): Pattern => ({
			kind: 'constructor',
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
			C.punctuation('('),
			C.lazy(() => parsePattern),
			C.punctuation(')')
		),
		([name, _openParen, arg, closeParen]): Pattern => ({
			kind: 'constructor',
			name: name.value,
			args: [arg],
			location: createLocation(name.location.start, closeParen.location.end),
		})
	),
	// Constructor or variable pattern: identifier (decide based on capitalization)
	C.map(C.identifier(), (name): Pattern => {
		// If identifier starts with uppercase, treat as constructor pattern
		if (name.value.length > 0 && name.value[0] >= 'A' && name.value[0] <= 'Z') {
			return {
				kind: 'constructor',
				name: name.value,
				args: [],
				location: name.location,
			};
		} else {
			// Otherwise, treat as variable pattern
			return {
				kind: 'variable',
				name: name.value,
				location: name.location,
			};
		}
	})
);

// --- Match Case Expression Parser ---
// This parser supports expressions in match cases, including nested match expressions
const parseMatchCaseExpression: C.Parser<Expression> = C.choice3(
	C.lazy(() => parseMatchExpression), // Support nested match expressions
	parseIfExpression, // Support if expressions
	C.lazy(() => parseExprWithType) // Support all other expressions including type annotations
);

// --- Match Case ---
const parseMatchCase: C.Parser<MatchCase> = C.map(
	C.seq(
		parsePattern,
		C.operator('=>'),
		C.lazy(() => parseMatchCaseExpression) // Use dedicated parser for match case expressions
	),
	([pattern, _arrow, expression]): MatchCase => ({
		pattern,
		expression,
		location: createLocation(pattern.location.start, expression.location.end),
	})
);

// --- Match Expression ---
const parseMatchExpression: C.Parser<MatchExpression> = C.map(
	C.seq(
		C.keyword('match'),
		C.lazy(() => parseThrush), // Use a simpler expression parser to avoid circular dependency
		C.keyword('with'),
		C.punctuation('('),
		C.sepBy(parseMatchCase, C.punctuation(';')),
		// Allow and ignore trailing semicolons after the last case
		C.many(C.punctuation(';')),
		C.punctuation(')')
	),
	([
		match,
		expression,
		_with,
		_openParen,
		cases,
		_trailingSemicolons,
		closeParen,
	]): MatchExpression => ({
		kind: 'match',
		expression,
		cases,
		location: createLocation(match.location.start, closeParen.location.end),
	})
);

// --- Where Expression ---
const parseWhereExpression: C.Parser<WhereExpression> = C.map(
	C.seq(
		C.lazy(() => parseWhereMainExpression), // Main expression (excludes lambda to avoid precedence issues)
		C.keyword('where'),
		C.punctuation('('),
		C.sepBy(parseWhereDefinition, C.punctuation(';')),
		// Allow and ignore trailing semicolons after the last definition
		C.many(C.punctuation(';')),
		C.punctuation(')')
	),
	([
		main,
		_where,
		_openParen,
		definitions,
		_trailingSemicolons,
		_closeParen,
	]): WhereExpression => ({
		kind: 'where',
		main,
		definitions,
		location: main.location,
	})
);

// Original choice-based parser for fallback
const parseSequenceTermOriginal: C.Parser<Expression> = C.choice(
	parseMutation,
	parseDefinition,
	parseWhereExpression,
	parseThrush
);

const parseSequenceTerm: C.Parser<Expression> = tokens => {
	if (tokens.length === 0) {
		return { success: false, error: 'Unexpected end of input', position: 0 };
	}

	const firstToken = tokens[0];

	// Comprehensive fast dispatch - handle 90%+ of cases to minimize fallback
	switch (firstToken.type) {
		case 'KEYWORD':
			switch (firstToken.value) {
				case 'constraint':
					return parseConstraintDefinition(tokens);
				case 'implement':
					return parseImplementDefinition(tokens);
				case 'variant':
					return parseTypeDefinition(tokens);
				case 'type':
					return parseUserDefinedType(tokens);
				case 'match':
					return parseMatchExpression(tokens);
				case 'import':
					return parseImportExpression(tokens);
				case 'if':
					return parseIfExpression(tokens);
				case 'fn':
					return parseLambdaExpression(tokens);
				case 'where':
					return parseWhereExpression(tokens);
				case 'mut':
					if (
						tokens.length > 1 &&
						tokens[1].type === 'OPERATOR' &&
						tokens[1].value === '!'
					) {
						return parseMutation(tokens);
					} else {
						return parseMutableDefinition(tokens);
					}
			}
			break;

		case 'IDENTIFIER':
			// Handle simple, unambiguous identifier patterns
			if (tokens.length > 1) {
				const secondToken = tokens[1];
				if (secondToken.type === 'OPERATOR' && secondToken.value === '=') {
					// Simple definition: x = expr
					return parseDefinition(tokens);
				}
				// Type annotations (x : Type) are more complex due to "given" clauses, constraints, etc.
				// Let those fall back to full parser for now
			}
			// Fall back to full parser for complex identifier cases
			break;

		case 'PUNCTUATION':
			// PUNCTUATION cases are complex and context-dependent
			// Always fall back to full parser for correctness
			break;

		case 'NUMBER':
		case 'STRING':
		case 'ACCESSOR':
			// Simple literals - handle directly with parseThrush
			return parseThrush(tokens);
	}

	// Fallback only for truly unknown cases
	return parseSequenceTermOriginal(tokens);
};

// TODO: should this use the fast path parser?
// Version for where clause main expressions - excludes lambda to avoid precedence issues
const parseWhereMainExpression: C.Parser<Expression> = C.choice(
	// Parse keyword-based expressions first to avoid identifier conflicts
	parseMatchExpression, // ADT pattern matching (starts with "match")
	parseTypeDefinition, // ADT variant definitions (starts with "variant")
	parseUserDefinedType, // User-defined types (starts with "type")
	parseConstraintDefinition, // constraint definitions (starts with "constraint")
	parseImplementDefinition, // implement definitions (starts with "implement")
	parseMutableDefinition, // starts with "mut"
	parseMutation, // starts with "mut!"
	parseImportExpression, // starts with "import"
	parseIfExpression, // if expressions (starts with "if")
	// Then parse identifier-based expressions (including destructuring)
	parseDefinition, // fallback to regular definitions
	parseThrush, // full expression hierarchy (includes all primaries and type annotations)
	parseNumber,
	parseString,
	parseIdentifier,
	parseList,
	parseAccessor,
	parseParenExpr
);

// --- Expression with type annotation (just above semicolon) ---
const parseExprWithType: C.Parser<Expression> = C.choice3(
	// Expression with type and constraints: expr : type given constraintExpr
	C.map(
		C.seq(
			parseThrush, // Use parseThrush to support full expression hierarchy
			C.punctuation(':'),
			C.lazy(() => parseTypeExpression),
			C.keyword('given'),
			parseConstraintExpr
		),
		([expr, _colon, type, _given, constraint]): ConstrainedExpression => ({
			kind: 'constrained',
			expression: expr,
			type,
			constraint,
			location: expr.location,
		})
	),
	// Expression with just type: expr : type
	C.map(
		C.seq(
			parseThrush, // Use parseThrush to support full expression hierarchy
			C.punctuation(':'),
			C.lazy(() => parseTypeExpression)
		),
		([expr, _colon, type]): TypedExpression => ({
			kind: 'typed',
			expression: expr,
			type,
			location: expr.location,
		})
	),
	C.lazy(() => parseSequenceTerm) // Fallback to regular expressions
);

// --- Sequence (semicolon) ---
// Accepts a sequence of definitions and/or expressions, separated by semicolons
const parseSequence: C.Parser<Expression> = C.map(
	C.seq(
		C.lazy(() => parseExprWithType),
		C.many(
			C.seq(
				C.punctuation(';'),
				C.lazy(() => parseExprWithType)
			)
		),
		// Allow and ignore any trailing semicolons with no RHS
		C.many(C.punctuation(';'))
	),
	([left, rest, _trailingSemicolons]) => {
		let result = left;
		for (const [_op, right] of rest) {
			result = {
				kind: 'binary',
				operator: ';',
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
// Helper: skip semicolons
const skipSemicolons = (tokens: Token[]): Token[] => {
	while (
		tokens.length > 0 &&
		tokens[0].type === 'PUNCTUATION' &&
		tokens[0].value === ';'
	) {
		tokens = tokens.slice(1);
	}
	return tokens;
};

// Clean combinator-based program parser
const parseStatements = (tokens: Token[]): C.ParseResult<Expression[]> => {
	const statements: Expression[] = [];
	let rest = skipSemicolons(tokens.filter(t => t.type !== 'EOF'));

	while (rest.length > 0) {
		const result = parseExpr(rest);
		if (!result.success) return result;

		statements.push(result.value);
		rest = skipSemicolons(result.remaining);
	}

	return { success: true, value: statements, remaining: [] };
};

export const parse = (tokens: Token[]): Program => {
	const result = parseStatements(tokens);
	if (!result.success) {
		const errorLocation =
			result.position > 0 ? ` at line ${result.position}` : '';
		throw new Error(`Parse error: ${result.error}${errorLocation}`);
	}

	// Check for leftover tokens (should be none after successful parse)
	if (result.remaining.length > 0) {
		const next = result.remaining[0];
		throw new Error(
			`Unexpected token after expression: ${next.type} '${next.value}' at line ${next.location.start.line}, column ${next.location.start.column}`
		);
	}
	return {
		statements: result.value,
		location: createLocation({ line: 1, column: 1 }, { line: 1, column: 1 }),
	};
};
