// Test execution helpers
import { Lexer } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { typeAndDecorate } from '../src/typer';
import { typeToString } from '../src/typer/helpers';
import { Evaluator } from '../src/evaluator/evaluator';
import { expect } from 'bun:test';
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
	ListExpression,
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
	Pattern,
	TuplePattern,
	ConstructorPattern,
	VariablePattern,
	LiteralPattern,
	WildcardPattern,
	RecordPattern,
	ConstrainedExpression,
	ConstraintExpr,
	ImplementsConstraint,
	OrConstraintExpr,
	AndConstraintExpr,
	ParenConstraintExpr,
	IsConstraint,
	HasFieldConstraint,
	HasStructureConstraint,
	PipelineExpression,
	TupleExpression,
	UnitExpression,
	TypeDefinitionExpression,
	WhereExpression,
	MutationExpression,
	MutableDefinitionExpression,
	UnitType,
	StructureFieldType,
	NestedStructureFieldType,
} from '../src/ast';
import type { ProgramResult } from '../src/evaluator/evaluator';
import type {
	Value,
	ConstructorValue,
	NativeValue,
	TraitFunctionValue,
	UnitValue,
	ListValue,
	RecordValue,
	FunctionValue,
	TupleValue,
	NumberValue,
	StringValue,
} from '../src/evaluator/evaluator-utils';
import type {
	ParseError,
	ParseResult,
	ParseSuccess,
} from '../src/parser/combinators';

export function assertLiteralExpression(
	expression: Expression
): asserts expression is LiteralExpression {
	if (expression.kind !== 'literal') {
		throw new Error(`Expected literal expression, got ${expression.kind}`);
	}
}
export function assertVariableExpression(
	expression: Expression
): asserts expression is VariableExpression {
	if (expression.kind !== 'variable') {
		throw new Error(`Expected variable expression, got ${expression.kind}`);
	}
}
export function assertFunctionExpression(
	expression: Expression
): asserts expression is FunctionExpression {
	if (expression.kind !== 'function') {
		throw new Error(`Expected function expression, got ${expression.kind}`);
	}
}
export function assertApplicationExpression(
	expression: Expression
): asserts expression is ApplicationExpression {
	if (expression.kind !== 'application') {
		throw new Error(`Expected application expression, got ${expression.kind}`);
	}
}
export function assertBinaryExpression(
	expression: Expression
): asserts expression is BinaryExpression {
	if (expression.kind !== 'binary') {
		throw new Error(`Expected binary expression, got ${expression.kind}`);
	}
}
export function assertIfExpression(
	expression: Expression
): asserts expression is IfExpression {
	if (expression.kind !== 'if') {
		throw new Error(`Expected if expression, got ${expression.kind}`);
	}
}
export function assertRecordExpression(
	expression: Expression
): asserts expression is RecordExpression {
	if (expression.kind !== 'record') {
		throw new Error(`Expected record expression, got ${expression.kind}`);
	}
}
export function assertAccessorExpression(
	expression: Expression
): asserts expression is AccessorExpression {
	if (expression.kind !== 'accessor') {
		throw new Error(`Expected accessor expression, got ${expression.kind}`);
	}
}

// Helper functions for type-safe testing
export function assertConstrainedExpression(
	expr: Expression
): asserts expr is ConstrainedExpression {
	if (expr.kind !== 'constrained') {
		throw new Error(`Expected constrained expression, got ${expr.kind}`);
	}
}

export function assertImplementsConstraint(
	constraint: ConstraintExpr
): asserts constraint is ImplementsConstraint {
	if (constraint.kind !== 'implements') {
		throw new Error(`Expected implements constraint, got ${constraint.kind}`);
	}
}

export function assertOrConstraint(
	constraint: ConstraintExpr
): asserts constraint is OrConstraintExpr {
	if (constraint.kind !== 'or') {
		throw new Error(`Expected or constraint, got ${constraint.kind}`);
	}
}

export function assertAndConstraint(
	constraint: ConstraintExpr
): asserts constraint is AndConstraintExpr {
	if (constraint.kind !== 'and') {
		throw new Error(`Expected and constraint, got ${constraint.kind}`);
	}
}

export function assertParenConstraint(
	constraint: ConstraintExpr
): asserts constraint is ParenConstraintExpr {
	if (constraint.kind !== 'paren') {
		throw new Error(`Expected paren constraint, got ${constraint.kind}`);
	}
}

export function assertIsConstraint(
	constraint: ConstraintExpr
): asserts constraint is IsConstraint {
	if (constraint.kind !== 'is') {
		throw new Error(`Expected is constraint, got ${constraint.kind}`);
	}
}

export function assertHasFieldConstraint(
	constraint: ConstraintExpr
): asserts constraint is HasFieldConstraint {
	if (constraint.kind !== 'hasField') {
		throw new Error(`Expected has field constraint, got ${constraint.kind}`);
	}
}

export function assertHasStructureConstraint(
	constraint: ConstraintExpr
): asserts constraint is HasStructureConstraint {
	if (constraint.kind !== 'has') {
		throw new Error(
			`Expected has structure constraint, got ${constraint.kind}`
		);
	}
}

export function assertUnitType(type: Type): asserts type is UnitType {
	if (type.kind !== 'unit') {
		throw new Error(`Expected unit type, got ${type.kind}`);
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
export function assertConstrainedType(
	type: Type
): asserts type is ConstrainedType {
	if (type.kind !== 'constrained') {
		throw new Error(`Expected kind 'constrained', got '${type.kind}'`);
	}
}

export function assertPrimitiveType(type: Type): asserts type is PrimitiveType {
	if (type.kind !== 'primitive') {
		throw new Error(`Expected kind 'primitive', got '${type.kind}'`);
	}
}

export function assertVariantType(type: Type): asserts type is VariantType {
	if (type.kind !== 'variant') {
		throw new Error(`Expected kind 'variant', got '${type.kind}'`);
	}
}

export function assertNestedStructureFieldType(
	field: StructureFieldType
): asserts field is NestedStructureFieldType {
	if (field.kind !== 'nested') {
		throw new Error(`Expected nested structure field, got ${field.kind}`);
	}
}

export function assertStructureFieldType(
	field: StructureFieldType
): asserts field is Type {
	if (field.kind === 'nested') {
		throw new Error(`Expected simple field type, got nested structure`);
	}
}

// ===== Expressions =====

export function assertDefinitionExpression(
	expression: Expression
): asserts expression is DefinitionExpression {
	if (expression.kind !== 'definition') {
		throw new Error(`Expected definition expression, got ${expression.kind}`);
	}
}
export function assertTypedExpression(
	expression: Expression
): asserts expression is TypedExpression {
	if (expression.kind !== 'typed') {
		throw new Error(`Expected typed expression, got ${expression.kind}`);
	}
}
export function assertMatchExpression(
	expression: Expression
): asserts expression is MatchExpression {
	if (expression.kind !== 'match') {
		throw new Error(`Expected match expression, got ${expression.kind}`);
	}
}
export function assertConstraintDefinitionExpression(
	expression: Expression
): asserts expression is ConstraintDefinitionExpression {
	if (expression.kind !== 'constraint-definition') {
		throw new Error(
			`Expected constraint definition expression, got ${expression.kind}`
		);
	}
}
export function assertImplementDefinitionExpression(
	expression: Expression
): asserts expression is ImplementDefinitionExpression {
	if (expression.kind !== 'implement-definition') {
		throw new Error(
			`Expected implement definition expression, got ${expression.kind}`
		);
	}
}

export function assertListExpression(
	expression: Expression
): asserts expression is ListExpression {
	if (expression.kind !== 'list') {
		throw new Error(`Expected list expression, got ${expression.kind}`);
	}
}

export function assertPipelineExpression(
	expression: Expression
): asserts expression is PipelineExpression {
	if (expression.kind !== 'pipeline') {
		throw new Error(`Expected pipeline expression, got ${expression.kind}`);
	}
}
export function assertTupleExpression(
	expression: Expression
): asserts expression is TupleExpression {
	if (expression.kind !== 'tuple') {
		throw new Error(`Expected tuple expression, got ${expression.kind}`);
	}
}

export function assertUnitExpression(
	expression: Expression
): asserts expression is UnitExpression {
	if (expression.kind !== 'unit') {
		throw new Error(`Expected unit expression, got ${expression.kind}`);
	}
}

export function assertTypeDefinitionExpression(
	expression: Expression
): asserts expression is TypeDefinitionExpression {
	if (expression.kind !== 'type-definition') {
		throw new Error(
			`Expected type definition expression, got ${expression.kind}`
		);
	}
}

export function assertWhereExpression(
	expression: Expression
): asserts expression is WhereExpression {
	if (expression.kind !== 'where') {
		throw new Error(`Expected where expression, got ${expression.kind}`);
	}
}
export function assertMutationExpression(
	expression: Expression
): asserts expression is MutationExpression {
	if (expression.kind !== 'mutation') {
		throw new Error(`Expected mutation expression, got ${expression.kind}`);
	}
}
export function assertMutableDefinitionExpression(
	expression: Expression
): asserts expression is MutableDefinitionExpression {
	if (expression.kind !== 'mutable-definition') {
		throw new Error(
			`Expected mutable definition expression, got ${expression.kind}`
		);
	}
}

// ===== Parse Results =====
export function assertParseSuccess<T>(
	result: ParseResult<T>
): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got parse error`);
	}
}

export function assertParseError<T>(
	result: ParseResult<T>
): asserts result is ParseError {
	if (result.success) {
		throw new Error(
			`Expected parse error, got success: (${JSON.stringify(result)})`
		);
	}
}

// ===== Value Assertions =====

// Value assertions for evaluator results
export function assertNumberValue(value: Value): asserts value is NumberValue {
	if (value.tag !== 'number') {
		throw new Error(`Expected number value, got ${value.tag}`);
	}
}

export function assertStringValue(value: Value): asserts value is StringValue {
	if (value.tag !== 'string') {
		throw new Error(`Expected string value, got ${value.tag}`);
	}
}

export function assertUnitValue(value: Value): asserts value is UnitValue {
	if (value.tag !== 'unit') {
		throw new Error(`Expected unit value, got ${value.tag}`);
	}
}

export function assertListValue(value: Value): asserts value is ListValue {
	if (value.tag !== 'list') {
		throw new Error(`Expected list value, got ${value.tag}`);
	}
}

export function assertRecordValue(value: Value): asserts value is RecordValue {
	if (value.tag !== 'record') {
		throw new Error(`Expected record value, got ${value.tag}`);
	}
}

export function assertFunctionValue(
	value: Value
): asserts value is FunctionValue {
	if (value.tag !== 'function') {
		throw new Error(`Expected function value, got ${value.tag}`);
	}
}

export function assertTupleValue(value: Value): asserts value is TupleValue {
	if (value.tag !== 'tuple') {
		throw new Error(`Expected tuple value, got ${value.tag}`);
	}
}

export function assertConstructorValue(
	value: Value
): asserts value is ConstructorValue {
	if (value.tag !== 'constructor') {
		throw new Error(`Expected constructor value, got ${value.tag}`);
	}
}

export function assertNativeValue(value: Value): asserts value is NativeValue {
	if (value.tag !== 'native') {
		throw new Error(`Expected native value, got ${value.tag}`);
	}
}

export function assertTraitFunctionValue(
	value: Value
): asserts value is TraitFunctionValue {
	if (value.tag !== 'trait-function') {
		throw new Error(`Expected trait-function value, got ${value.tag}`);
	}
}

// ===== Unwrapping =====

function unwrapValue(val: Value): unknown {
	if (val === null) return null;
	if (typeof val !== 'object') return val;
	switch (val.tag) {
		case 'number':
			return val.value;
		case 'string':
			return val.value;
		case 'constructor':
			if (val.name === 'True') return true;
			if (val.name === 'False') return false;
			return val;
		case 'list':
			return val.values.map(unwrapValue);
		case 'tuple':
			return val.values.map(unwrapValue);
		case 'record': {
			const obj: Record<string, unknown> = {};
			for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
			return obj;
		}
		default:
			return val;
	}
}

export function parseAndType(code: string): ReturnType<typeof typeAndDecorate> {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const ast = parse(tokens);
	return typeAndDecorate(ast);
}

export function runCode(code: string): {
	evalResult: ProgramResult;
	typeResult: ReturnType<typeof typeAndDecorate>;
	finalType: string;
	finalValue: unknown;
} {
	const decoratedResult = parseAndType(code);
	const evaluator = new Evaluator({
		traitRegistry: decoratedResult.state.traitRegistry,
	});
	const evalResult = evaluator.evaluateProgram(decoratedResult.program);

	return {
		evalResult,
		typeResult: decoratedResult,
		finalType: typeToString(
			decoratedResult.type!,
			decoratedResult.state.substitution
		),
		finalValue: unwrapValue(evalResult.finalResult),
	};
}

export function expectError(code: string, errorPattern?: RegExp | string) {
	try {
		runCode(code);
		throw new Error('Expected error but code succeeded');
	} catch (error) {
		if (errorPattern) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			expect(errorMessage).toMatch(new RegExp(errorPattern, 'i'));
		}
	}
}

export function expectSuccess(code: string, expectedValue?: unknown) {
	const result = runCode(code);
	if (expectedValue !== undefined) {
		expect(result.finalValue).toEqual(expectedValue);
	}
	return result;
}
// pattern helpers
export function assertTuplePattern(
	pattern: Pattern
): asserts pattern is TuplePattern {
	if (pattern.kind !== 'tuple') {
		throw new Error(`Expected tuple pattern, got ${pattern.kind}`);
	}
}

export function assertConstructorPattern(
	pattern: Pattern
): asserts pattern is ConstructorPattern {
	if (pattern.kind !== 'constructor') {
		throw new Error(`Expected constructor pattern, got ${pattern.kind}`);
	}
}

export function assertVariablePattern(
	pattern: Pattern
): asserts pattern is VariablePattern {
	if (pattern.kind !== 'variable') {
		throw new Error(`Expected variable pattern, got ${pattern.kind}`);
	}
}

export function assertLiteralPattern(
	pattern: Pattern
): asserts pattern is LiteralPattern {
	if (pattern.kind !== 'literal') {
		throw new Error(`Expected literal pattern, got ${pattern.kind}`);
	}
}

export function assertWildcardPattern(
	pattern: Pattern
): asserts pattern is WildcardPattern {
	if (pattern.kind !== 'wildcard') {
		throw new Error(`Expected wildcard pattern, got ${pattern.kind}`);
	}
}

export function assertRecordPattern(
	pattern: Pattern
): asserts pattern is RecordPattern {
	if (pattern.kind !== 'record') {
		throw new Error(`Expected record pattern, got ${pattern.kind}`);
	}
}