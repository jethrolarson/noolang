import type { Token } from '../lexer/lexer';
import {
	createLocation,
	type Type,
	type Effect,
	floatType,
	stringType,
	unitType,
	listTypeWithElement,
	functionType,
	typeVariable,
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
	type ConstructorDefinition,
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
	const typeKeywords = ['Float', 'String', 'Unit', 'List', 'Unknown'];

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

// Parse primitive types (Float, String, etc.)
const parsePrimitiveType = (tokens: Token[]): C.ParseResult<Type> => {
	const primitiveTypes = ['Float', 'String', 'Unit', 'Unknown'];
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
				case 'Unknown':
					return {
						success: true,
						value: { kind: 'unknown' },
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
const parseListType: C.Parser<Type> = C.map(
	C.seq(C.keyword('List'), C.optional(C.lazy(() => parseTypeAtom))),
	([_keyword, elementType]) =>
		listTypeWithElement(elementType || typeVariable('a'))
);

// Helper to convert field array to record object
const fieldsToRecord = (
	fields: Array<[string, Type]> | null
): Record<string, Type> => {
	const fieldObj: Record<string, Type> = {};
	if (fields) {
		for (const [name, type] of fields) {
			fieldObj[name] = type;
		}
	}
	return fieldObj;
};

// Parse record type {field: Type, ...} or {@field Type, ...}
const parseRecordType: C.Parser<Type> = C.choice(
	// Record type with accessor syntax (without colons): { @field Type, @field2 Type }
	C.map(
		C.seq(
			C.punctuation('{'),
			C.optional(
				C.sepBy(
					C.map(
						C.seq(
							C.accessor(),
							C.lazy(() => parseTypeExpression)
						),
						([accessor, type]): [string, Type] => [accessor.value, type]
					),
					C.punctuation(',')
				)
			),
			C.punctuation('}')
		),
		([_open, fields, _close]) => recordType(fieldsToRecord(fields))
	),

	// Record type with colon syntax: { field: Type, @field: Type }
	C.map(
		C.seq(
			C.punctuation('{'),
			C.optional(
				C.sepBy(
					C.map(
						C.seq(
							C.choice2(
								// Support @field syntax (ACCESSOR tokens)
								C.map(C.accessor(), accessor => ({ value: accessor.value })),
								// Also support plain identifier for backward compatibility
								C.identifier()
							),
							C.punctuation(':'),
							C.lazy(() => parseTypeExpression)
						),
						([name, _colon, type]): [string, Type] => [name.value, type]
					),
					C.punctuation(',')
				)
			),
			C.punctuation('}')
		),
		([_open, fields, _close]) => recordType(fieldsToRecord(fields))
	)
);

// Parse tuple type {Type, Type, ...}
const parseTupleType: C.Parser<Type> = C.map(
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
	([_open, elements, _close]) => tupleType(elements || [])
);

// Parse parenthesized type (Type)
const parseParenthesizedType: C.Parser<Type> = C.map(
	C.seq(
		C.punctuation('('),
		C.lazy(() => parseTypeExpression),
		C.punctuation(')')
	),
	([_open, type, _close]) => type
);

// Parse simple type variable or nullary constructor (no type applications)
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

// Parse type constructor or variable (TypeName, a, Option a, etc.)
const parseTypeConstructorOrVariable = (
	tokens: Token[]
): C.ParseResult<Type> => {
	if (tokens.length > 0 && tokens[0].type === 'IDENTIFIER') {
		const typeNameResult = C.identifier()(tokens);
		if (typeNameResult.success) {
			const typeName = typeNameResult.value.value;

			// Try to parse type arguments (use simple parsing to avoid nested type applications)
			const argsResult = C.many(parseSimpleTypeArgument)(
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

// Parse simple type arguments (no type applications to avoid Result a b becoming Result (a b))
const parseSimpleTypeArgument = C.choice(
	parsePrimitiveType,
	parseListType,
	parseRecordType,
	parseTupleType,
	parseTupleConstructor,
	parseParenthesizedType,
	parseSimpleTypeVariable // Use simple variable parser that doesn't parse applications
);

// Main type atom parser - now clean and focused
const parseTypeAtom = C.choice(
	parsePrimitiveType,
	parseListType,
	parseRecordType,
	parseTupleType,
	parseTupleConstructor,
	parseParenthesizedType,
	parseTypeConstructorOrVariable
);

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

// Parse effects: !effect1 !effect2 ...
const parseEffects: C.Parser<Set<Effect>> = (tokens: Token[]) => {
	const effects = new Set<Effect>();
	let remaining = tokens;

	while (
		remaining &&
		remaining.length > 0 &&
		remaining[0].type === 'OPERATOR' &&
		remaining[0].value === '!'
	) {
		remaining = remaining.slice(1); // consume !

		// Expect an effect name (identifier or keyword)
		if (
			!remaining ||
			remaining.length === 0 ||
			(remaining[0].type !== 'IDENTIFIER' && remaining[0].type !== 'KEYWORD')
		) {
			return {
				success: false,
				error: 'Expected effect name after !',
				position: remaining?.[0]?.location?.start?.line || 0,
			};
		}

		const effectName = remaining[0].value;

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
				position: remaining[0].location.start.line,
			};
		}

		effects.add(effectName as Effect);
		remaining = remaining.slice(1); // consume effect name
	}

	return {
		success: true,
		value: effects,
		remaining,
	};
};

// Parse function type with effects: a -> b !effect
export const parseTypeExpression: C.Parser<Type> = (tokens: Token[]) => {
	const leftResult = parseTypeAtom(tokens);
	if (!leftResult.success) {
		// Return a more generic error message for consistency
		return {
			success: false,
			error: 'Expected type expression',
			position: tokens[0]?.location.start.line || 0,
		};
	}

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
		const effectsResult = parseEffects(rightResult.remaining);
		if (!effectsResult.success) return effectsResult;

		// Apply effects to the function type
		const finalType = { ...functionTypeResult, effects: effectsResult.value };

		return {
			success: true,
			value: finalType,
			remaining: effectsResult.remaining,
		};
	}

	// If no arrow, just return the left result
	return {
		success: true,
		value: leftResult.value,
		remaining: leftResult.remaining,
	};
};

// Parse a simple type atom for ADT constructor arguments (no type constructor applications)
const parseSimpleTypeAtom = C.choice(
	parsePrimitiveType,
	parseListType,
	parseRecordType,
	parseTupleType,
	parseTupleConstructor,
	parseParenthesizedType,
	parseSimpleTypeVariable // Use a simpler parser for variables
);

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
export const parseTypeDefinition: C.Parser<TypeDefinitionExpression> = C.map(
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
export const parseUserDefinedType: C.Parser<UserDefinedTypeExpression> = C.map(
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
		location: createLocation(typeKeyword.location.start, equals.location.end),
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
	([_openBrace, fields, _closeBrace]): RecordTypeDefinition => {
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
	([_openBrace, elements, _closeBrace]): TupleTypeDefinition => ({
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
const parseStructuredTypeDefinition: C.Parser<
	RecordTypeDefinition | TupleTypeDefinition
> = (tokens: Token[]) => {
	// Look ahead to see if we have accessor syntax (@field) or regular types
	if (tokens.length === 0)
		return { success: false, error: 'Unexpected end of input', position: 0 };

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
const parseUserDefinedTypeDefinition: C.Parser<UserDefinedTypeDefinition> =
	C.choice2(
		C.map(parseStructuredTypeDefinition, (s): UserDefinedTypeDefinition => s),
		C.map(parseUnionTypeDefinition, (u): UserDefinedTypeDefinition => u)
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
					type,
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
		C.seq(C.identifier(), C.keyword('is'), C.identifier()),
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
export const parseConstraintExpr: C.Parser<ConstraintExpr> = tokens => {
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
