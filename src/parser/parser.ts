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
	type Type,
	type Effect,
	floatType,
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
	type UserDefinedTypeExpression,
	type UserDefinedTypeDefinition,
	type RecordTypeDefinition,
	type TupleTypeDefinition,
	type UnionTypeDefinition,
	userDefinedRecordType,
	userDefinedTupleType,
	userDefinedUnionType,
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
	type MutationExpression,
	type RecordStructure,
	type StructureFieldType,
	recordStructure,
	hasStructureConstraint,
} from '../ast';
import * as C from './combinators';

// --- Helper: parse type name (IDENTIFIER or type-related KEYWORD) ---
const parseTypeName: C.Parser<Token> = (tokens: Token[]) => {
	if (tokens.length === 0) {
		return {
			success: false,
			error: 'Expected type name, but got end of input',
			position: 0,
		};
	}

	const [first, ...rest] = tokens;
	const typeKeywords = ['Float', 'String', 'Unit', 'List'];

	if (
		first.type === 'IDENTIFIER' ||
		(first.type === 'KEYWORD' && typeKeywords.includes(first.value))
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

// --- Smaller focused type parsers ---

// Parse primitive types (Float, String, etc.)
const parsePrimitiveType = (tokens: Token[]): C.ParseResult<Type> => {
	const primitiveTypes = ['Float', 'String', 'Unit'];
	for (const typeName of primitiveTypes) {
		const result = C.keyword(typeName)(tokens);
		if (result.success) {
			switch (typeName) {
				case 'Float':
					return {
						success: true,
						value: floatType(),
						remaining: result.remaining,
					};
				case 'String':
					return {
						success: true,
						value: stringType(),
						remaining: result.remaining,
					};
				case 'Unit':
					return {
						success: true,
						value: unitType(),
						remaining: result.remaining,
					};
			}
		}
	}
	return {
		success: false,
		error: 'Expected primitive type',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse List type with optional element type
const parseListType = (tokens: Token[]): C.ParseResult<Type> => {
	const listKeywordResult = C.keyword('List')(tokens);
	if (listKeywordResult.success) {
		// Try to parse a type argument for List
		const argResult = C.lazy(() => parseTypeAtom)(listKeywordResult.remaining);
		if (argResult.success) {
			// List with specific element type: List Float, List String, etc.
			return {
				success: true,
				value: listTypeWithElement(argResult.value),
				remaining: argResult.remaining,
			};
		} else {
			// Just List (generic)
			return {
				success: true,
				value: listTypeWithElement(typeVariable('a')),
				remaining: listKeywordResult.remaining,
			};
		}
	}
	return {
		success: false,
		error: 'Expected List type',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse record type {field: Type, ...} or {@field Type, ...}
const parseRecordType = (tokens: Token[]): C.ParseResult<Type> => {
	// Try record type with accessor syntax (without colons): { @field Type, @field2 Type }
	const accessorRecordResult = C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.map(
					C.seq(
						C.accessor(),
						C.lazy(() => parseTypeExpression)
					),
					([accessor, type]) => [accessor.value, type] as [string, Type]
				),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
	)(tokens);
	if (accessorRecordResult.success) {
		const fields: Array<[string, Type]> = accessorRecordResult.value[1] || [];
		const fieldObj: Record<string, Type> = {};
		for (const [name, type] of fields) {
			fieldObj[name] = type;
		}
		return {
			success: true as const,
			value: recordType(fieldObj),
			remaining: accessorRecordResult.remaining,
		};
	}

	// Try record type with colon syntax: { field: Type, @field: Type }
	const recordResult = C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.map(
					C.seq(
						C.choice(
							// Support @field syntax (ACCESSOR tokens)
							C.map(C.accessor(), accessor => ({ value: accessor.value })),
							// Also support plain identifier for backward compatibility
							C.identifier()
						),
						C.punctuation(':'),
						C.lazy(() => parseTypeExpression)
					),
					([name, _colon, type]) => [name.value, type] as [string, Type]
				),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
	)(tokens);
	if (recordResult.success) {
		const fields: Array<[string, Type]> = recordResult.value[1] || [];
		const fieldObj: Record<string, Type> = {};
		for (const [name, type] of fields) {
			fieldObj[name] = type;
		}
		return {
			success: true,
			value: recordType(fieldObj),
			remaining: recordResult.remaining,
		};
	}
	return {
		success: false,
		error: 'Expected record type',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse tuple type {Type, Type, ...}
const parseTupleType = (tokens: Token[]): C.ParseResult<Type> => {
	const tupleResult = C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.lazy(() => parseTypeExpression),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
	)(tokens);
	if (tupleResult.success) {
		const elements = tupleResult.value[1] || [];
		return {
			success: true,
			value: tupleType(elements),
			remaining: tupleResult.remaining,
		};
	}
	return {
		success: false,
		error: 'Expected tuple type',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse parenthesized type (Type)
const parseParenthesizedType = (tokens: Token[]): C.ParseResult<Type> => {
	const parenResult = C.seq(
		C.punctuation('('),
		C.lazy(() => parseTypeExpression),
		C.punctuation(')')
	)(tokens);
	if (parenResult.success) {
		return {
			success: true,
			value: parenResult.value[1],
			remaining: parenResult.remaining,
		};
	}
	return {
		success: false,
		error: 'Expected parenthesized type',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse type constructor or variable (TypeName, a, Option a, etc.)
const parseTypeConstructorOrVariable = (
	tokens: Token[]
): C.ParseResult<Type> => {
	if (tokens.length > 0 && tokens[0].type === 'IDENTIFIER') {
		const typeNameResult = C.identifier()(tokens);
		if (typeNameResult.success) {
			const typeName = typeNameResult.value.value;

			// Try to parse type arguments
			const argsResult = C.many(C.lazy(() => parseTypeAtom))(
				typeNameResult.remaining
			);
			if (argsResult.success && argsResult.value.length > 0) {
				// Type constructor with arguments (like Option a, f a, List String)
				return {
					success: true,
					value: { kind: 'variant', name: typeName, args: argsResult.value },
					remaining: argsResult.remaining,
				};
			} else {
				// Check if it's a type constructor (uppercase) or type variable (lowercase)
				const isUpperCase = typeName[0] === typeName[0].toUpperCase();
				if (isUpperCase) {
					// Type constructor without arguments (like Bool, Option, etc.)
					return {
						success: true,
						value: { kind: 'variant', name: typeName, args: [] },
						remaining: typeNameResult.remaining,
					};
				} else {
					// Type variable (like a, b, etc.)
					return {
						success: true,
						value: typeVariable(typeName),
						remaining: typeNameResult.remaining,
					};
				}
			}
		}
	}
	return {
		success: false,
		error: 'Expected type constructor or variable',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse Tuple type constructor: Tuple T1 T2 T3
const parseTupleConstructor = (tokens: Token[]): C.ParseResult<Type> => {
	if (
		tokens.length > 0 &&
		tokens[0].type === 'IDENTIFIER' &&
		tokens[0].value === 'Tuple'
	) {
		const tupleConstructorResult = C.seq(
			C.identifier(),
			C.many(C.lazy(() => parseTypeExpression))
		)(tokens);
		if (tupleConstructorResult.success) {
			const elementTypes = tupleConstructorResult.value[1];
			return {
				success: true,
				value: tupleTypeConstructor(elementTypes),
				remaining: tupleConstructorResult.remaining,
			};
		}
	}
	return {
		success: false,
		error: 'Expected Tuple constructor',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Main type atom parser - now clean and focused
function parseTypeAtom(tokens: Token[]): C.ParseResult<Type> {
	// Try each type parser in order
	const parsers = [
		parsePrimitiveType,
		parseListType,
		parseRecordType,
		parseTupleType,
		parseTupleConstructor,
		parseParenthesizedType,
		parseTypeConstructorOrVariable,
	];

	for (const parser of parsers) {
		const result = parser(tokens);
		if (result.success) {
			return result;
		}
	}

	return {
		success: false,
		error: 'Expected type atom',
		position: tokens[0]?.location.start.line || 0,
	};
}

// --- Type Expression ---
// Helper function to parse function types without top-level effects (right-associative)
const parseFunctionTypeWithoutEffects: C.Parser<Type> = tokens => {
	const leftResult = parseTypeAtom(tokens);
	if (!leftResult.success) return leftResult;

	const rest = leftResult.remaining;

	// Check for -> operator
	if (
		rest &&
		rest.length > 0 &&
		rest[0].type === 'OPERATOR' &&
		rest[0].value === '->'
	) {
		// Right-associative: recursively parse the rest as a function type
		const rightResult = parseFunctionTypeWithoutEffects(rest.slice(1));
		if (!rightResult.success) return rightResult;
		if (!rightResult.value)
			return {
				success: false,
				error: 'Expected type expression',
				position: tokens[0]?.location.start.line || 0,
			};

		return {
			success: true as const,
			value: functionType([leftResult.value], rightResult.value),
			remaining: rightResult.remaining,
		};
	}

	return { success: true as const, value: leftResult.value, remaining: rest };
};

export const parseTypeExpression: C.Parser<Type> = tokens => {
	// Try function type (right-associative): a -> b -> c FIRST
	const funcType = (() => {
		const leftResult = parseTypeAtom(tokens);
		if (!leftResult.success) return leftResult;

		const rest = leftResult.remaining;

		// Check for -> operator for right-associative parsing
		if (
			rest &&
			rest.length > 0 &&
			rest[0].type === 'OPERATOR' &&
			rest[0].value === '->'
		) {
			const rightResult = parseFunctionTypeWithoutEffects(rest.slice(1));
			if (!rightResult.success) return rightResult;
			if (!rightResult.value)
				return {
					success: false,
					error: 'Expected type expression',
					position: tokens[0]?.location.start.line || 0,
				};

			const functionTypeResult = functionType(
				[leftResult.value],
				rightResult.value
			);

			// Parse effects at the end of the entire function type chain
			const effects = new Set<Effect>();
			let effectRest = rightResult.remaining;

			// Parse effects: !effect1 !effect2 ...
			while (
				effectRest &&
				effectRest.length > 0 &&
				effectRest[0].type === 'OPERATOR' &&
				effectRest[0].value === '!'
			) {
				effectRest = effectRest.slice(1); // consume !

				// Expect an effect name (identifier or keyword)
				if (
					!effectRest ||
					effectRest.length === 0 ||
					(effectRest[0].type !== 'IDENTIFIER' &&
						effectRest[0].type !== 'KEYWORD')
				) {
					return {
						success: false,
						error: 'Expected effect name after !',
						position: effectRest?.[0]?.location?.start?.line || 0,
					};
				}

				const effectName = effectRest[0].value;

				// Validate effect name
				const validEffects: Effect[] = [
					'log',
					'read',
					'write',
					'state',
					'time',
					'rand',
					'ffi',
					'async',
				];
				if (!validEffects.includes(effectName as Effect)) {
					return {
						success: false,
						error: `Invalid effect: ${effectName}. Valid effects: ${validEffects.join(', ')}`,
						position: effectRest[0].location.start.line,
					};
				}

				effects.add(effectName as Effect);
				effectRest = effectRest.slice(1); // consume effect name
			}

			// Apply effects to the function type (including empty effects)
			const finalType = { ...functionTypeResult, effects };

			return {
				success: true as const,
				value: finalType,
				remaining: effectRest,
			};
		}

		// If no arrow, just return the left result
		return {
			success: true as const,
			value: leftResult.value,
			remaining: leftResult.remaining,
		};
	})();

	if (funcType.success && funcType.value) {
		return funcType;
	}

	// If function type parsing failed with a specific effect error, return that error
	if (
		!funcType.success &&
		(funcType.error.includes('Invalid effect:') ||
			funcType.error.includes('Expected effect name after !'))
	) {
		return funcType as C.ParseError;
	}

	// Try type variable (lowercase identifier)
	if (
		tokens.length > 0 &&
		tokens[0].type === 'IDENTIFIER' &&
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

	// Try record type: { name: String, age: Float }
	const recordResult = C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.map(
					C.seq(
						C.identifier(),
						C.punctuation(':'),
						C.lazy(() => parseTypeExpression)
					),
					([name, _colon, type]) => [name.value, type] as [string, Type]
				),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
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

	// Try tuple type: { Float, String }
	const tupleResult = C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.lazy(() => parseTypeExpression),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
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
		C.keyword('List'),
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
		error: 'Expected type expression',
		position: tokens[0]?.location.start.line || 0,
	};
};

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
	token => token.value.endsWith('?') ? token.value.slice(0, -1) : token.value // Just get the field name without @ and without optional marker
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
const parseLambdaExpression: C.Parser<FunctionExpression | TypedExpression | ConstrainedExpression> = tokens => {
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

	// Parse the body, allowing in-body type annotations
	const bodyResult = C.lazy(() => parseExprWithType)(
		arrowResult.remaining
	);
	if (!bodyResult.success) {
		return bodyResult;
	}

	// If the parsed body itself is a typed/constrained expression whose type is a function,
	// hoist that annotation to the lambda (so it annotates the function rather than the body).
	if (
		(bodyResult.value.kind === 'typed' || bodyResult.value.kind === 'constrained') &&
		(bodyResult.value.type.kind === 'function')
	) {
		const innerBody = bodyResult.value.expression;
		const funcExpr: FunctionExpression = {
			kind: 'function',
			params: paramNames,
			body: innerBody,
			location: fnResult.value.location,
		};
		if (bodyResult.value.kind === 'typed') {
			const typed: TypedExpression = {
				kind: 'typed',
				expression: funcExpr,
				type: bodyResult.value.type,
				location: funcExpr.location,
			};
			return { success: true, value: typed, remaining: bodyResult.remaining };
		} else {
			const constrained: ConstrainedExpression = {
				kind: 'constrained',
				expression: funcExpr,
				type: bodyResult.value.type,
				constraint: bodyResult.value.constraint,
				location: funcExpr.location,
			};
			return { success: true, value: constrained, remaining: bodyResult.remaining };
		}
	}

	// Build the function expression first
	let funcExpr: FunctionExpression = {
		kind: 'function',
		params: paramNames,
		body: bodyResult.value,
		location: fnResult.value.location,
	};
	let rem = bodyResult.remaining;

	// If a type annotation appears immediately after the lambda body,
	// treat it as annotating the whole function rather than the body.
	while (rem.length > 0) {
		const ann = parseTypeAnnotation(rem);
		if (!ann.success) break;
		if (ann.value.constraint) {
			const constrained: ConstrainedExpression = {
				kind: 'constrained',
				expression: funcExpr,
				type: ann.value.type,
				constraint: ann.value.constraint,
				location: funcExpr.location,
			};
			// After wrapping, further annotations should wrap the previous node
			funcExpr = constrained as unknown as FunctionExpression; // will be wrapped below if another ann
			return {
				success: true,
				value: constrained,
				remaining: ann.remaining,
			};
		} else {
			const typed: TypedExpression = {
				kind: 'typed',
				expression: funcExpr,
				type: ann.value.type,
				location: funcExpr.location,
			};
			return {
				success: true,
				value: typed,
				remaining: ann.remaining,
			};
		}
	}

	return {
		success: true,
		value: funcExpr,
		remaining: rem,
	};
};

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
	// DEBUG: Log tokens at entry
	if (process.env.NOO_DEBUG_PARSE) {
		console.log('parsePrimary tokens:', tokens.map(t => t.value).join(' '));
	}

	// Fast token-based dispatch instead of sequential choice attempts
	if (tokens.length === 0) {
		return { success: false, error: 'Unexpected end of input', position: 0 };
	}

	const firstToken = tokens[0];
	let result: C.ParseResult<Expression>;

	// Dispatch based on token type and value for O(1) selection
	switch (firstToken.type) {
		case 'NUMBER':
			result = parseNumber(tokens);
			break;
		case 'STRING':
			result = parseString(tokens);
			break;
		case 'IDENTIFIER':
			result = parseIdentifier(tokens);
			break;
		case 'ACCESSOR':
			result = parseAccessor(tokens);
			break;
		case 'PUNCTUATION':
			if (firstToken.value === '[') {
				result = parseList(tokens);
			} else if (firstToken.value === '{') {
				result = parseRecord(tokens);
			} else if (firstToken.value === '(') {
				result = parseParenExpr(tokens);
			} else {
				result = {
					success: false,
					error: `Unexpected punctuation: ${firstToken.value}`,
					position: firstToken.location.start.line,
				};
			}
			break;
		case 'KEYWORD':
			if (firstToken.value === 'fn') {
				result = parseLambdaExpression(tokens);
			} else if (firstToken.value === 'let') {
				result = C.lazy(() => parseDefinitionWithType)(tokens);
			} else if (firstToken.value === 'import') {
				result = parseImportExpression(tokens);
			} else {
				result = {
					success: false,
					error: `Unexpected keyword: ${firstToken.value}`,
					position: firstToken.location.start.line,
				};
			}
			break;
		default:
			result = {
				success: false,
				error: `Unexpected token type: ${firstToken.type}`,
				position: firstToken.location.start.line,
			};
			break;
	}

	// DEBUG: Log result
	if (process.env.NOO_DEBUG_PARSE) {
		console.log(
			'parsePrimary result:',
			result.success ? result.value : result.error
		);
	}
	return result;
};

// --- Primary with Postfix (type annotations) ---
const parsePrimaryWithPostfix: C.Parser<Expression> = tokens => {
	if (process.env.NOO_DEBUG_PARSE) {
		console.log(
			'parsePrimaryWithPostfix tokens:',
			tokens.map(t => t.value).join(' ')
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
			'parsePrimaryWithPostfix result:',
			postfixResult.success ? postfixResult.value : postfixResult.error
		);
	}
	return postfixResult;
};

// --- Unary Operators (negation, only if '-' is adjacent to the next token) ---
const parseUnary: C.Parser<Expression> = tokens => {
	if (process.env.NOO_DEBUG_PARSE) {
		console.log('parseUnary tokens:', tokens.map(t => t.value).join(' '));
	}
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
			const operandResult = parsePrimaryWithPostfix(tokens.slice(1));
			if (!operandResult.success) return operandResult;
			const result = {
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
			if (process.env.NOO_DEBUG_PARSE) {
				console.log('parseUnary result (negation):', result.value);
			}
			return result;
		}
	}
	// Otherwise, fall through to parsePrimaryWithPostfix
	const result = parsePrimaryWithPostfix(tokens);
	if (process.env.NOO_DEBUG_PARSE) {
		console.log(
			'parseUnary result:',
			result.success ? result.value : result.error
		);
	}
	return result;
};

// --- Function Application (left-associative, tightest binding) ---
const parseApplication: C.Parser<Expression> = tokens => {
	const appResult = C.map(
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
	)(tokens);

	if (!appResult.success) return appResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(appResult.value, appResult.remaining);
};

// --- Multiplicative (*, /, %) ---
const parseMultiplicative: C.Parser<Expression> = tokens => {
	const multResult = C.map(
		C.seq(
			parseApplication,
			C.many(
				C.seq(
					C.choice(C.operator('*'), C.operator('/'), C.operator('%')),
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
	)(tokens);

	if (!multResult.success) return multResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(multResult.value, multResult.remaining);
};

// --- Additive (+, -) ---
const parseAdditive: C.Parser<Expression> = tokens => {
	const addResult = C.map(
		C.seq(
			parseMultiplicative,
			C.many(
				C.seq(C.choice(C.operator('+'), C.operator('-')), parseMultiplicative)
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

	if (!addResult.success) return addResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(addResult.value, addResult.remaining);
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

	if (!compResult.success) return compResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(compResult.value, compResult.remaining);
};

// --- Composition (|>, <|) ---
const parseCompose: C.Parser<Expression> = tokens => {
	const compResult = C.map(
		C.seq(
			parseComparison,
			C.many(
				C.seq(C.choice(C.operator('|>'), C.operator('<|')), parseComparison)
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

	if (!compResult.success) return compResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(compResult.value, compResult.remaining);
};

// --- Thrush (|) and Safe Thrush (|?) ---
const parseThrush: C.Parser<Expression> = tokens => {
	const thrushResult = C.map(
		C.seq(
			parseDollar,
			C.many(C.seq(C.choice(C.operator('|'), C.operator('|?')), parseDollar))
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

	if (!thrushResult.success) return thrushResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(thrushResult.value, thrushResult.remaining);
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

		return parsePostfixFromResult(result, rightResult.remaining);
	}

	// No $ operator found, just return the left expression
	return parsePostfixFromResult(leftResult.value, leftResult.remaining);
};

// --- If Expression (after dollar, before sequence) ---
const parseIfAfterDollar: C.Parser<Expression> = tokens => {
	const ifResult = parseIfExpression(tokens);
	if (!ifResult.success) return ifResult;

	// Apply postfix operators (type annotations) to the result
	return parsePostfixFromResult(ifResult.value, ifResult.remaining);
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

// Clean postfix parser using combinators
const parsePostfixFromResult = (
	expr: Expression,
	tokens: Token[]
): C.ParseResult<Expression> => {
	let result = expr;
	let remaining = tokens;

	// Try to parse type annotations repeatedly
	while (remaining.length > 0) {
		const annotationResult = parseTypeAnnotation(remaining);
		if (!annotationResult.success) break;

		// Create appropriate expression based on whether we have constraints
		if (annotationResult.value.constraint) {
			result = {
				kind: 'constrained',
				expression: result,
				type: annotationResult.value.type,
				constraint: annotationResult.value.constraint,
				location: result.location,
			};
		} else {
			result = {
				kind: 'typed',
				expression: result,
				type: annotationResult.value.type,
				location: result.location,
			};
		}

		remaining = annotationResult.remaining;
	}

	return { success: true, value: result, remaining };
};

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
const parseTupleDestructuring: C.Parser<
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
			C.lazy(() => parseSequenceTermWithIf)
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
const parseRecordDestructuring: C.Parser<
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
			C.lazy(() => parseSequenceTermWithIf)
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
	return C.map(
		C.seq(
			C.identifier(),
			C.operator('='),
			C.lazy(() => parseExprWithType)
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
};

// --- Definition with typed expression (now just a regular definition) ---
const parseDefinitionWithType: C.Parser<Expression> = parseDefinition;

// --- Mutable Definition ---
const parseMutableDefinition: C.Parser<MutableDefinitionExpression> = C.map(
	C.seq(
		C.keyword('mut'),
		C.identifier(),
		C.operator('='),
		C.lazy(() => parseSequenceTermWithIf)
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
		C.lazy(() => parseSequenceTermWithIf)
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
			C.lazy(() => parseSequenceTermWithIf)
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

// Parse a simple type atom for ADT constructor arguments (no type constructor applications)
const parseSimpleTypeAtom = (tokens: Token[]): C.ParseResult<Type> => {
	// Try each simple type parser in order (no type constructor applications)
	const parsers = [
		parsePrimitiveType,
		parseListType,
		parseRecordType,
		parseTupleType,
		parseTupleConstructor,
		parseParenthesizedType,
		parseSimpleTypeVariable, // Use a simpler parser for variables
	];

	for (const parser of parsers) {
		const result = parser(tokens);
		if (result.success) {
			return result;
		}
	}

	return {
		success: false,
		error: 'Expected simple type atom',
		position: tokens[0]?.location.start.line || 0,
	};
};

// Parse type variable or nullary type constructor (no arguments allowed)
const parseSimpleTypeVariable = (tokens: Token[]): C.ParseResult<Type> => {
	if (tokens.length > 0 && tokens[0].type === 'IDENTIFIER') {
		const typeNameResult = C.identifier()(tokens);
		if (typeNameResult.success) {
			const typeName = typeNameResult.value.value;

			// Check if it's a type constructor (uppercase) or type variable (lowercase)
			const isUpperCase = typeName[0] === typeName[0].toUpperCase();
			if (isUpperCase) {
				// Type constructor without arguments (like Bool, Option, etc.)
				return {
					success: true,
					value: { kind: 'variant', name: typeName, args: [] },
					remaining: typeNameResult.remaining,
				};
			} else {
				// Type variable (like a, b, etc.)
				return {
					success: true,
					value: typeVariable(typeName),
					remaining: typeNameResult.remaining,
				};
			}
		}
	}
	return {
		success: false,
		error: 'Expected type variable or nullary type constructor',
		position: tokens[0]?.location.start.line || 0,
	};
};

// --- ADT Constructor ---
const parseConstructor: C.Parser<ConstructorDefinition> = C.map(
	C.seq(parseTypeName, C.many(parseSimpleTypeAtom)), // Use parseSimpleTypeAtom to avoid type constructor applications
	([name, args]): ConstructorDefinition => ({
		name: name.value,
		args,
		location: createLocation(name.location.start, name.location.end),
	})
);

// --- Variant Definition ---
const parseTypeDefinition: C.Parser<TypeDefinitionExpression> = C.map(
	C.seq(
		C.keyword('variant'),
		parseTypeName,
		C.many(C.identifier()),
		C.operator('='),
		C.sepBy(parseConstructor, C.operator('|'))
	),
	([
		type,
		name,
		typeParams,
		equals,
		constructors,
	]): TypeDefinitionExpression => ({
		kind: 'type-definition',
		name: name.value,
		typeParams: typeParams.map(p => p.value),
		constructors,
		location: createLocation(
			type.location.start,
			constructors[constructors.length - 1]?.location.end || equals.location.end
		),
	})
);

// --- User-Defined Type Definition ---
const parseUserDefinedType: C.Parser<UserDefinedTypeExpression> = C.map(
	C.seq(
		C.keyword('type'),
		parseTypeName,
		C.many(C.identifier()),
		C.operator('='),
		C.lazy(() => parseUserDefinedTypeDefinition)
	),
	([
		typeKeyword,
		name,
		typeParams,
		equals,
		definition,
	]): UserDefinedTypeExpression => ({
		kind: 'user-defined-type',
		name: name.value,
		typeParams: typeParams.map(p => p.value),
		definition: definition as UserDefinedTypeDefinition,
		location: createLocation(
			typeKeyword.location.start,
			equals.location.end
		),
	})
);

// Parse record type definition: {@field Type, ...}  
const parseRecordTypeDefinition: C.Parser<RecordTypeDefinition> = C.map(
	C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.map(
					C.seq(
						C.accessor(),
						C.lazy(() => parseTypeExpression)
					),
					([accessor, type]) => [accessor.value, type] as [string, Type]
				),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
	),
	([openBrace, fields, closeBrace]): RecordTypeDefinition => {
		const fieldObj: { [key: string]: Type } = {};
		if (fields) {
			for (const [name, type] of fields) {
				fieldObj[name] = type;
			}
		}
		return {
			kind: 'record-type',
			fields: fieldObj,
		};
	}
);

// Parse tuple type definition: {Type, Type, ...}
const parseTupleTypeDefinition: C.Parser<TupleTypeDefinition> = C.map(
	C.seq(
		C.punctuation('{'),
		C.optional(
			C.sepBy(
				C.lazy(() => parseTypeExpression),
				C.punctuation(',')
			)
		),
		C.punctuation('}')
	),
	([openBrace, elements, closeBrace]): TupleTypeDefinition => ({
		kind: 'tuple-type',
		elements: elements || [],
	})
);

// Parse union type definition: Type1 | Type2 | ...
const parseUnionTypeDefinition: C.Parser<UnionTypeDefinition> = C.map(
	C.sepBy(
		C.lazy(() => parseTypeExpression),
		C.operator('|')
	),
	(types: Type[]): UnionTypeDefinition => ({
		kind: 'union-type',
		types,
	})
);

// Parse structured type definition (record or tuple based on content)
const parseStructuredTypeDefinition: C.Parser<RecordTypeDefinition | TupleTypeDefinition> = (tokens: Token[]) => {
	// Look ahead to see if we have accessor syntax (@field) or regular types
	if (tokens.length === 0) return { success: false, error: 'Unexpected end of input', position: 0 };
	
	if (tokens[0].type !== 'PUNCTUATION' || tokens[0].value !== '{') {
		return { success: false, error: 'Expected {', position: 0 };
	}
	
	// Look ahead to determine if this is a record (has @) or tuple (no @)
	let i = 1;
	let hasAccessor = false;
	let braceCount = 1;
	
	while (i < tokens.length && braceCount > 0) {
		if (tokens[i].type === 'PUNCTUATION') {
			if (tokens[i].value === '{') braceCount++;
			else if (tokens[i].value === '}') braceCount--;
		} else if (tokens[i].type === 'ACCESSOR') {
			hasAccessor = true;
			break;
		}
		i++;
	}
	
	// Parse as record or tuple based on what we found
	if (hasAccessor) {
		return parseRecordTypeDefinition(tokens);
	} else {
		return parseTupleTypeDefinition(tokens);
	}
};

// Parse user-defined type definition (structured type or union)
const parseUserDefinedTypeDefinition: C.Parser<UserDefinedTypeDefinition> = C.choice(
	C.map(parseStructuredTypeDefinition, (s): UserDefinedTypeDefinition => s),
	C.map(parseUnionTypeDefinition, (u): UserDefinedTypeDefinition => u)
);

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

const parsePatternFields: C.Parser<{ isRecord: boolean; fieldName?: string; pattern: Pattern }[]> = (tokens: Token[]): C.ParseResult<{ isRecord: boolean; fieldName?: string; pattern: Pattern }[]> => {
	const fields: { isRecord: boolean; fieldName?: string; pattern: Pattern }[] = [];
	let rest = tokens;
	
	// Parse first field/element
	const firstResult = parsePatternFieldOrElement(0)(rest);
	if (!firstResult.success) {
		return firstResult;
	}
	
	fields.push(firstResult.value);
	rest = firstResult.remaining;
	
	// Parse remaining fields/elements with comma separators
	while (rest.length > 0 && rest[0].type === 'PUNCTUATION' && rest[0].value === ',') {
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
		remaining: rest
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
				location: createLocation(open.location.start, close.location.end)
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
					location: f.pattern.location
				})),
				location: createLocation(open.location.start, close.location.end)
			};
		} else if (allTuple) {
			// Tuple pattern
			return {
				kind: 'tuple',
				elements: fieldsList.map(f => f.pattern),
				location: createLocation(open.location.start, close.location.end)
			};
		} else {
			// Mixed - error
			throw new Error('Cannot mix record fields (@field) and tuple elements in the same pattern');
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
const parseMatchCaseExpression: C.Parser<Expression> = C.choice(
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
		C.punctuation(')')
	),
	([
		match,
		expression,
		_with,
		_openParen,
		cases,
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
		C.punctuation(')')
	),
	([main, _where, _openParen, definitions, _closeParen]): WhereExpression => {
		return {
			kind: 'where',
			main,
			definitions,
			location: main.location,
		};
	}
);

// --- Sequence term: everything else ---
const parseSequenceTerm: C.Parser<Expression> = C.choice(
	// Parse keyword-based expressions first to avoid identifier conflicts
	parseMatchExpression, // ADT pattern matching (starts with "match")
	parseTypeDefinition, // ADT variant definitions (starts with "variant")
	parseUserDefinedType, // User-defined types (starts with "type")
	parseConstraintDefinition, // constraint definitions (starts with "constraint")
	parseImplementDefinition, // implement definitions (starts with "implement")
	parseMutableDefinition, // starts with "mut"
	parseMutation, // starts with "mut!"
	parseImportExpression, // starts with "import"
	parseIfAfterDollar, // if expressions (starts with "if")
	// Then parse identifier-based expressions (including destructuring)
	parseDefinitionWithType, // allow definitions with type annotations (includes destructuring)
	parseDefinition, // fallback to regular definitions
	parseWhereExpression, // where expressions (must come before lambda to avoid precedence issues)
	parseLambdaExpression, // lambda expressions (moved after where)
	parseThrush, // full expression hierarchy (includes all primaries and type annotations)
	parseRecord,
	parseThrush
);

// parseSequenceTerm now includes parseIfExpression
const parseSequenceTermWithIf: C.Parser<Expression> = parseSequenceTerm;

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
	parseIfAfterDollar, // if expressions (starts with "if")
	// Then parse identifier-based expressions (including destructuring)
	parseDefinitionWithType, // allow definitions with type annotations (includes destructuring)
	parseDefinition, // fallback to regular definitions
	parseThrush, // full expression hierarchy (includes all primaries and type annotations)
	parseNumber,
	parseString,
	parseIdentifier,
	parseList,
	parseAccessor,
	parseParenExpr
);

// --- Parse record structure for constraints ---
const parseRecordStructure: C.Parser<RecordStructure> = C.map(
	C.seq(
		C.punctuation('{'),
		C.sepBy(
			C.map(
				C.seq(
					C.accessor(),
					C.lazy(() => parseTypeExpression)
				),
				([accessor, type]): [string, StructureFieldType] => [
					accessor.value, // Accessor value already excludes the @ prefix
					type
				]
			),
			C.punctuation(',')
		),
		C.punctuation('}')
	),
	([_open, fields, _close]): RecordStructure => {
		const fieldMap: { [key: string]: StructureFieldType } = {};
		for (const [fieldName, fieldType] of fields) {
			fieldMap[fieldName] = fieldType;
		}
		return recordStructure(fieldMap);
	}
);

// --- Parse atomic constraint ---
const parseAtomicConstraint: C.Parser<ConstraintExpr> = C.choice(
	// Parenthesized constraint
	C.map(
		C.seq(
			C.punctuation('('),
			C.lazy(() => parseConstraintExpr),
			C.punctuation(')')
		),
		([_open, expr, _close]) => ({ kind: 'paren', expr })
	),
	// a is Collection
	C.map(
		C.seq(
			C.identifier(),
			C.keyword('is'),
			C.choice(
				C.identifier()
				// Removed meaningless constraint keywords
			)
		),
		([typeVar, _isKeyword, constraint]): ConstraintExpr => ({
			kind: 'is',
			typeVar: typeVar.value,
			constraint: constraint.value,
		})
	),
	// a has {@name String, @age Float} - Try this first since it has distinct syntax
	C.map(
		C.seq(C.identifier(), C.keyword('has'), parseRecordStructure),
		([typeVar, _has, structure]): ConstraintExpr =>
			hasStructureConstraint(typeVar.value, structure)
	),
	// a has field "name" of type T
	C.map(
		C.seq(
			C.identifier(),
			C.keyword('has'),
			C.keyword('field'),
			C.string(),
			C.keyword('of'),
			C.keyword('type'),
			C.lazy(() => parseTypeExpression)
		),
		([
			typeVar,
			_has,
			_field,
			fieldName,
			_of,
			_type,
			fieldType,
		]): ConstraintExpr => ({
			kind: 'hasField',
			typeVar: typeVar.value,
			field: fieldName.value,
			fieldType,
		})
	),
	// a implements Interface
	C.map(
		C.seq(C.identifier(), C.keyword('implements'), C.identifier()),
		([typeVar, _implementsKeyword, interfaceName]): ConstraintExpr => ({
			kind: 'implements',
			typeVar: typeVar.value,
			interfaceName: interfaceName.value,
		})
	)
);

// --- Parse constraint expression with precedence: and > or ---
const parseConstraintExpr: C.Parser<ConstraintExpr> = tokens => {
	// Parse left side (and chains)
	const leftResult = parseConstraintAnd(tokens);
	if (!leftResult.success) return leftResult;
	let left = leftResult.value;
	let rest = leftResult.remaining;

	// Parse or chains
	while (
		rest.length > 0 &&
		rest[0].type === 'KEYWORD' &&
		rest[0].value === 'or'
	) {
		rest = rest.slice(1);
		const rightResult = parseConstraintAnd(rest);
		if (!rightResult.success) return rightResult;
		left = { kind: 'or', left, right: rightResult.value };
		rest = rightResult.remaining;
	}
	return { success: true as const, value: left, remaining: rest };
};

const parseConstraintAnd: C.Parser<ConstraintExpr> = tokens => {
	const leftResult = parseAtomicConstraint(tokens);
	if (!leftResult.success) return leftResult;
	let left = leftResult.value;
	let rest = leftResult.remaining;

	while (
		rest.length > 0 &&
		rest[0].type === 'KEYWORD' &&
		rest[0].value === 'and'
	) {
		rest = rest.slice(1);
		const rightResult = parseAtomicConstraint(rest);
		if (!rightResult.success) return rightResult;
		left = { kind: 'and', left, right: rightResult.value };
		rest = rightResult.remaining;
	}
	return { success: true as const, value: left, remaining: rest };
};

// --- Expression with type annotation (just above semicolon) ---
// Simplified: rely on lower-precedence parsers to apply postfix type annotations consistently
const parseExprWithType: C.Parser<Expression> = C.choice(
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
	C.lazy(() => parseSequenceTermWithIf) // Fallback to regular expressions
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
		)
	),
	([left, rest]) => {
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
	while (tokens.length > 0 && tokens[0].type === 'PUNCTUATION' && tokens[0].value === ';') {
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
		const errorLocation = result.position > 0 ? ` at line ${result.position}` : '';
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
