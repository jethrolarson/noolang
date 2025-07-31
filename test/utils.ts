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
	Expression,
} from '../src/ast';
import type { Value } from '../src/evaluator/evaluator';
import type {
	ParseError,
	ParseResult,
	ParseSuccess,
} from '../src/parser/combinators';



export function assertLiteralExpression(expression: Expression): asserts expression is LiteralExpression {
	if (expression.kind !== 'literal') {
		throw new Error(`Expected literal expression, got ${expression.kind}`);
	}
}
export function assertVariableExpression(expression: Expression): asserts expression is VariableExpression {
	if (expression.kind !== 'variable') {
		throw new Error(`Expected variable expression, got ${expression.kind}`);
	}
}
export function assertFunctionExpression(expression: Expression): asserts expression is FunctionExpression {
	if (expression.kind !== 'function') {
		throw new Error(`Expected function expression, got ${expression.kind}`);
	}
}
export function assertApplicationExpression(expression: Expression): asserts expression is ApplicationExpression {
	if (expression.kind !== 'application') {
		throw new Error(`Expected application expression, got ${expression.kind}`);
	}
}
export function assertBinaryExpression(expression: Expression): asserts expression is BinaryExpression {
	if (expression.kind !== 'binary') {
		throw new Error(`Expected binary expression, got ${expression.kind}`);
	}
}
export function assertIfExpression(expression: Expression): asserts expression is IfExpression {
	if (expression.kind !== 'if') {
		throw new Error(`Expected if expression, got ${expression.kind}`);
	}
}
export function assertRecordExpression(expression: Expression): asserts expression is RecordExpression {
	if (expression.kind !== 'record') {
		throw new Error(`Expected record expression, got ${expression.kind}`);
	}
}
export function assertAccessorExpression(expression: Expression): asserts expression is AccessorExpression {
	if (expression.kind !== 'accessor') {
		throw new Error(`Expected accessor expression, got ${expression.kind}`);
	}
}

export function assertRecordType(type: Type): asserts type is RecordType {
	if (type.kind !== 'record') {
		throw new Error(`Expected record type, got ${type.kind}`);
	}
}
export function assertTupleType(type: Type): asserts type is TupleType {
	if (type.kind !== 'tuple') {
		throw new Error(`Expected tuple type, got ${type.kind}`);
	}
}
export function assertListType(type: Type): asserts type is ListType {
	if (type.kind !== 'list') {
		throw new Error(`Expected list type, got ${type.kind}`);
	}
}
export function assertFunctionType(type: Type): asserts type is FunctionType {
	if (type.kind !== 'function') {
		throw new Error(`Expected function type, got ${type.kind}`);
	}
}
export function assertVariableType(type: Type): asserts type is VariableType {
	if (type.kind !== 'variable') {
		throw new Error(`Expected variable type, got ${type.kind}`);
	}
}
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

export function assertDefinitionExpression(expression: Expression): asserts expression is DefinitionExpression {
	if (expression.kind !== 'definition') {
		throw new Error(`Expected definition expression, got ${expression.kind}`);
	}
}
export function assertTypedExpression(expression: Expression): asserts expression is TypedExpression {
	if (expression.kind !== 'typed') {
		throw new Error(`Expected typed expression, got ${expression.kind}`);
	}
}
export function assertMatchExpression(expression: Expression): asserts expression is MatchExpression {
	if (expression.kind !== 'match') {
		throw new Error(`Expected match expression, got ${expression.kind}`);
	}
}
export function assertConstraintDefinitionExpression(expression: Expression): asserts expression is ConstraintDefinitionExpression {
	if (expression.kind !== 'constraint-definition') {
		throw new Error(`Expected constraint definition expression, got ${expression.kind}`);
	}
}
export function assertImplementDefinitionExpression(expression: Expression): asserts expression is ImplementDefinitionExpression {
	if (expression.kind !== 'implement-definition') {
		throw new Error(`Expected implement definition expression, got ${expression.kind}`);
	}
}

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
export function assertNumberValue(value: Value): asserts value is Extract<Value, { tag: 'number' }> {
	if (value.tag !== 'number') {
		throw new Error(`Expected number value, got ${value.tag}`);
	}
}

export function assertStringValue(value: Value): asserts value is Extract<Value, { tag: 'string' }> {
	if (value.tag !== 'string') {
		throw new Error(`Expected string value, got ${value.tag}`);
	}
}

export function assertUnitValue(value: Value): asserts value is Extract<Value, { tag: 'unit' }> {
	if (value.tag !== 'unit') {
		throw new Error(`Expected unit value, got ${value.tag}`);
	}
}

export function assertListValue(value: Value): asserts value is Extract<Value, { tag: 'list' }> {
	if (value.tag !== 'list') {
		throw new Error(`Expected list value, got ${value.tag}`);
	}
}

export function assertRecordValue(value: Value): asserts value is Extract<Value, { tag: 'record' }> {
	if (value.tag !== 'record') {
		throw new Error(`Expected record value, got ${value.tag}`);
	}
}

export function assertFunctionValue(value: Value): asserts value is Extract<Value, { tag: 'function' }> {
	if (value.tag !== 'function') {
		throw new Error(`Expected function value, got ${value.tag}`);
	}
}

export function assertTupleValue(value: Value): asserts value is Extract<Value, { tag: 'tuple' }> {
	if (value.tag !== 'tuple') {
		throw new Error(`Expected tuple value, got ${value.tag}`);
	}
}

export function assertConstructorValue(value: Value): asserts value is Extract<Value, { tag: 'constructor' }> {
	if (value.tag !== 'constructor') {
		throw new Error(`Expected constructor value, got ${value.tag}`);
	}
}

export function assertNativeValue(value: Value): asserts value is Extract<Value, { tag: 'native' }> {
	if (value.tag !== 'native') {
		throw new Error(`Expected native value, got ${value.tag}`);
	}
}

export function assertTraitFunctionValue(value: Value): asserts value is Extract<Value, { tag: 'trait-function' }> {
	if (value.tag !== 'trait-function') {
		throw new Error(`Expected trait-function value, got ${value.tag}`);
	}
}

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
