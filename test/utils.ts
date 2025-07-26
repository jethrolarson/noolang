import type {
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	BinaryExpression,
	IfExpression,
	RecordExpression,
	AccessorExpression,
	RecordType,
	TupleType,
	ListType,
	FunctionType,
	VariableType,
	DefinitionExpression,
	TypedExpression,
	MatchExpression,
	ConstraintDefinitionExpression,
	ImplementDefinitionExpression,
	ConstrainedType,
	PrimitiveType,
	VariantType,
	Type,
} from '../src/ast';
import type { Value } from '../src/evaluator/evaluator';
import type {
	ParseError,
	ParseResult,
	ParseSuccess,
} from '../src/parser/combinators';

export const assertKind =
	<T extends { kind: string }, K extends T['kind']>(expectedKind: K) =>
	(value: T): asserts value is Extract<T, { kind: K }> => {
		if (value.kind !== expectedKind) {
			throw new Error(`Expected kind '${expectedKind}', got '${value.kind}'`);
		}
	};

export const assertLiteralExpression = assertKind<LiteralExpression, 'literal'>(
	'literal'
);
export const assertVariableExpression = assertKind<
	VariableExpression,
	'variable'
>('variable');
export const assertFunctionExpression = assertKind<
	FunctionExpression,
	'function'
>('function');
export const assertApplicationExpression = assertKind<
	ApplicationExpression,
	'application'
>('application');
export const assertBinaryExpression = assertKind<BinaryExpression, 'binary'>(
	'binary'
);
export const assertIfExpression = assertKind<IfExpression, 'if'>('if');
export const assertRecordExpression = assertKind<RecordExpression, 'record'>(
	'record'
);
export const assertAccessorExpression = assertKind<
	AccessorExpression,
	'accessor'
>('accessor');

export const assertRecordType = assertKind<RecordType, 'record'>('record');
export const assertTupleType = assertKind<TupleType, 'tuple'>('tuple');
export const assertListType = assertKind<ListType, 'list'>('list');
export const assertFunctionType = assertKind<FunctionType, 'function'>(
	'function'
);
export const assertVariableType = assertKind<VariableType, 'variable'>(
	'variable'
);
export function assertConstrainedType(type: Type): asserts type is ConstrainedType {
	if (type.kind !== "constrained") {
		throw new Error(`Expected kind 'constrained', got '${type.kind}'`);
	}
}

export function assertPrimitiveType(type: Type): asserts type is PrimitiveType {
	if (type.kind !== "primitive") {
		throw new Error(`Expected kind 'primitive', got '${type.kind}'`);
	}
}

export function assertVariantType(type: Type): asserts type is VariantType {
	if (type.kind !== "variant") {
		throw new Error(`Expected kind 'variant', got '${type.kind}'`);
	}
}

export const assertDefinitionExpression = assertKind<
	DefinitionExpression,
	'definition'
>('definition');
export const assertTypedExpression = assertKind<TypedExpression, 'typed'>(
	'typed'
);
export const assertMatchExpression = assertKind<MatchExpression, 'match'>(
	'match'
);

// Trait system expressions
export const assertConstraintDefinitionExpression = assertKind<
	ConstraintDefinitionExpression,
	'constraint-definition'
>('constraint-definition');
export const assertImplementDefinitionExpression = assertKind<
	ImplementDefinitionExpression,
	'implement-definition'
>('implement-definition');

// Other expressions - these would be added when the types exist in AST
// export const assertTypeAliasExpression = assertKind<TypeAliasExpression, 'type-alias'>('type-alias');
// export const assertSequenceExpression = assertKind<SequenceExpression, 'sequence'>('sequence');

export const assertParseSuccess = <T>(
	result: ParseResult<T>
): asserts result is ParseSuccess<T> => {
	if (!result.success) {
		throw new Error(`Expected parse success, got parse error`);
	}
};

export const assertParseError = <T>(
	result: ParseResult<T>
): asserts result is ParseError => {
	if (result.success) {
		throw new Error(
			`Expected parse error, got success: (${JSON.stringify(result)})`
		);
	}
};

// Value assertions for evaluator results
export const assertNumberValue: (value: Value) => asserts value is Extract<Value, { tag: 'number' }> = (value: Value): asserts value is Extract<Value, { tag: 'number' }> => {
	if (value.tag !== 'number') {
		throw new Error(`Expected number value, got ${value.tag}`);
	}
};

export const assertStringValue: (value: Value) => asserts value is Extract<Value, { tag: 'string' }> = (value: Value): asserts value is Extract<Value, { tag: 'string' }> => {
	if (value.tag !== 'string') {
		throw new Error(`Expected string value, got ${value.tag}`);
	}
};

export const assertUnitValue: (value: Value) => asserts value is Extract<Value, { tag: 'unit' }> = (value: Value): asserts value is Extract<Value, { tag: 'unit' }> => {
	if (value.tag !== 'unit') {
		throw new Error(`Expected unit value, got ${value.tag}`);
	}
};

export const assertListValue: (value: Value) => asserts value is Extract<Value, { tag: 'list' }> = (value: Value): asserts value is Extract<Value, { tag: 'list' }> => {
	if (value.tag !== 'list') {
		throw new Error(`Expected list value, got ${value.tag}`);
	}
};

export const assertRecordValue = (value: Value): asserts value is Extract<Value, { tag: 'record' }> => {
	if (value.tag !== 'record') {
		throw new Error(`Expected record value, got ${value.tag}`);
	}
};

export const assertFunctionValue = (value: Value): asserts value is Extract<Value, { tag: 'function' }> => {
	if (value.tag !== 'function') {
		throw new Error(`Expected function value, got ${value.tag}`);
	}
};

export const assertTupleValue = (value: Value): asserts value is Extract<Value, { tag: 'tuple' }> => {
	if (value.tag !== 'tuple') {
		throw new Error(`Expected tuple value, got ${value.tag}`);
	}
};

export const assertConstructorValue = (value: Value): asserts value is Extract<Value, { tag: 'constructor' }> => {
	if (value.tag !== 'constructor') {
		throw new Error(`Expected constructor value, got ${value.tag}`);
	}
};

export const assertNativeValue = (value: Value): asserts value is Extract<Value, { tag: 'native' }> => {
	if (value.tag !== 'native') {
		throw new Error(`Expected native value, got ${value.tag}`);
	}
};

export const assertTraitFunctionValue = (value: Value): asserts value is Extract<Value, { tag: 'trait-function' }> => {
	if (value.tag !== 'trait-function') {
		throw new Error(`Expected trait-function value, got ${value.tag}`);
	}
};

// Utility for asserting specific type kinds
export const assertTypeKind = <K extends Type['kind']>(expectedKind: K) => 
	(type: Type): asserts type is Extract<Type, { kind: K }> => {
		if (type.kind !== expectedKind) {
			throw new Error(`Expected type kind '${expectedKind}', got '${type.kind}'`);
		}
	};

// Utility for asserting specific value tags
export const assertValueTag = <T extends Value['tag']>(expectedTag: T) => 
	(value: Value): asserts value is Extract<Value, { tag: T }> => {
		if (value.tag !== expectedTag) {
			throw new Error(`Expected value tag '${expectedTag}', got '${value.tag}'`);
		}
	};
