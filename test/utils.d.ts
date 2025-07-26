import type { LiteralExpression, VariableExpression, FunctionExpression, ApplicationExpression, BinaryExpression, IfExpression, RecordExpression, AccessorExpression, RecordType, TupleType, ListType, FunctionType, VariableType, DefinitionExpression, TypedExpression, MatchExpression, ConstraintDefinitionExpression, ImplementDefinitionExpression, ConstrainedType, PrimitiveType, VariantType, Type } from '../src/ast';
import type { Value } from '../src/evaluator/evaluator';
import type { ParseError, ParseResult, ParseSuccess } from '../src/parser/combinators';
export declare const assertKind: <T extends {
    kind: string;
}, K extends T["kind"]>(expectedKind: K) => (value: T) => asserts value is Extract<T, {
    kind: K;
}>;
export declare const assertLiteralExpression: (value: LiteralExpression) => asserts value is LiteralExpression;
export declare const assertVariableExpression: (value: VariableExpression) => asserts value is VariableExpression;
export declare const assertFunctionExpression: (value: FunctionExpression) => asserts value is FunctionExpression;
export declare const assertApplicationExpression: (value: ApplicationExpression) => asserts value is ApplicationExpression;
export declare const assertBinaryExpression: (value: BinaryExpression) => asserts value is BinaryExpression;
export declare const assertIfExpression: (value: IfExpression) => asserts value is IfExpression;
export declare const assertRecordExpression: (value: RecordExpression) => asserts value is RecordExpression;
export declare const assertAccessorExpression: (value: AccessorExpression) => asserts value is AccessorExpression;
export declare const assertRecordType: (value: RecordType) => asserts value is RecordType;
export declare const assertTupleType: (value: TupleType) => asserts value is TupleType;
export declare const assertListType: (value: ListType) => asserts value is ListType;
export declare const assertFunctionType: (value: FunctionType) => asserts value is FunctionType;
export declare const assertVariableType: (value: VariableType) => asserts value is VariableType;
export declare const assertConstrainedType: (type: Type) => asserts type is ConstrainedType;
export declare const assertPrimitiveType: (type: Type) => asserts type is PrimitiveType;
export declare const assertVariantType: (type: Type) => asserts type is VariantType;
export declare const assertDefinitionExpression: (value: DefinitionExpression) => asserts value is DefinitionExpression;
export declare const assertTypedExpression: (value: TypedExpression) => asserts value is TypedExpression;
export declare const assertMatchExpression: (value: MatchExpression) => asserts value is MatchExpression;
export declare const assertConstraintDefinitionExpression: (value: ConstraintDefinitionExpression) => asserts value is ConstraintDefinitionExpression;
export declare const assertImplementDefinitionExpression: (value: ImplementDefinitionExpression) => asserts value is ImplementDefinitionExpression;
export declare const assertParseSuccess: <T>(result: ParseResult<T>) => asserts result is ParseSuccess<T>;
export declare const assertParseError: <T>(result: ParseResult<T>) => asserts result is ParseError;
export declare const assertNumberValue: (value: Value) => asserts value is Extract<Value, {
    tag: 'number';
}>;
export declare const assertStringValue: (value: Value) => asserts value is Extract<Value, {
    tag: 'string';
}>;
export declare const assertUnitValue: (value: Value) => asserts value is Extract<Value, {
    tag: 'unit';
}>;
export declare const assertListValue: (value: Value) => asserts value is Extract<Value, {
    tag: 'list';
}>;
export declare const assertRecordValue: (value: Value) => asserts value is Extract<Value, {
    tag: "record";
}>;
export declare const assertFunctionValue: (value: Value) => asserts value is Extract<Value, {
    tag: "function";
}>;
export declare const assertTupleValue: (value: Value) => asserts value is Extract<Value, {
    tag: "tuple";
}>;
export declare const assertConstructorValue: (value: Value) => asserts value is Extract<Value, {
    tag: "constructor";
}>;
export declare const assertNativeValue: (value: Value) => asserts value is Extract<Value, {
    tag: "native";
}>;
export declare const assertTraitFunctionValue: (value: Value) => asserts value is Extract<Value, {
    tag: "trait-function";
}>;
export declare const assertTypeKind: <K extends Type["kind"]>(expectedKind: K) => (type: Type) => asserts type is Extract<Type, {
    kind: K;
}>;
export declare const assertValueTag: <T extends Value["tag"]>(expectedTag: T) => (value: Value) => asserts value is Extract<Value, {
    tag: T;
}>;
//# sourceMappingURL=utils.d.ts.map