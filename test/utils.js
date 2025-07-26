"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertValueTag = exports.assertTypeKind = exports.assertTraitFunctionValue = exports.assertNativeValue = exports.assertConstructorValue = exports.assertTupleValue = exports.assertFunctionValue = exports.assertRecordValue = exports.assertListValue = exports.assertUnitValue = exports.assertStringValue = exports.assertNumberValue = exports.assertParseError = exports.assertParseSuccess = exports.assertImplementDefinitionExpression = exports.assertConstraintDefinitionExpression = exports.assertMatchExpression = exports.assertTypedExpression = exports.assertDefinitionExpression = exports.assertVariantType = exports.assertPrimitiveType = exports.assertConstrainedType = exports.assertVariableType = exports.assertFunctionType = exports.assertListType = exports.assertTupleType = exports.assertRecordType = exports.assertAccessorExpression = exports.assertRecordExpression = exports.assertIfExpression = exports.assertBinaryExpression = exports.assertApplicationExpression = exports.assertFunctionExpression = exports.assertVariableExpression = exports.assertLiteralExpression = exports.assertKind = void 0;
const assertKind = (expectedKind) => (value) => {
    if (value.kind !== expectedKind) {
        throw new Error(`Expected kind '${expectedKind}', got '${value.kind}'`);
    }
};
exports.assertKind = assertKind;
exports.assertLiteralExpression = (0, exports.assertKind)('literal');
exports.assertVariableExpression = (0, exports.assertKind)('variable');
exports.assertFunctionExpression = (0, exports.assertKind)('function');
exports.assertApplicationExpression = (0, exports.assertKind)('application');
exports.assertBinaryExpression = (0, exports.assertKind)('binary');
exports.assertIfExpression = (0, exports.assertKind)('if');
exports.assertRecordExpression = (0, exports.assertKind)('record');
exports.assertAccessorExpression = (0, exports.assertKind)('accessor');
exports.assertRecordType = (0, exports.assertKind)('record');
exports.assertTupleType = (0, exports.assertKind)('tuple');
exports.assertListType = (0, exports.assertKind)('list');
exports.assertFunctionType = (0, exports.assertKind)('function');
exports.assertVariableType = (0, exports.assertKind)('variable');
exports.assertConstrainedType = (0, exports.assertKind)('constrained');
exports.assertPrimitiveType = (0, exports.assertKind)('primitive');
exports.assertVariantType = (0, exports.assertKind)('variant');
exports.assertDefinitionExpression = (0, exports.assertKind)('definition');
exports.assertTypedExpression = (0, exports.assertKind)('typed');
exports.assertMatchExpression = (0, exports.assertKind)('match');
// Trait system expressions
exports.assertConstraintDefinitionExpression = (0, exports.assertKind)('constraint-definition');
exports.assertImplementDefinitionExpression = (0, exports.assertKind)('implement-definition');
// Other expressions - these would be added when the types exist in AST
// export const assertTypeAliasExpression = assertKind<TypeAliasExpression, 'type-alias'>('type-alias');
// export const assertSequenceExpression = assertKind<SequenceExpression, 'sequence'>('sequence');
const assertParseSuccess = (result) => {
    if (!result.success) {
        throw new Error(`Expected parse success, got parse error`);
    }
};
exports.assertParseSuccess = assertParseSuccess;
const assertParseError = (result) => {
    if (result.success) {
        throw new Error(`Expected parse error, got success: (${JSON.stringify(result)})`);
    }
};
exports.assertParseError = assertParseError;
// Value assertions for evaluator results
const assertNumberValue = (value) => {
    if (value.tag !== 'number') {
        throw new Error(`Expected number value, got ${value.tag}`);
    }
};
exports.assertNumberValue = assertNumberValue;
const assertStringValue = (value) => {
    if (value.tag !== 'string') {
        throw new Error(`Expected string value, got ${value.tag}`);
    }
};
exports.assertStringValue = assertStringValue;
const assertUnitValue = (value) => {
    if (value.tag !== 'unit') {
        throw new Error(`Expected unit value, got ${value.tag}`);
    }
};
exports.assertUnitValue = assertUnitValue;
const assertListValue = (value) => {
    if (value.tag !== 'list') {
        throw new Error(`Expected list value, got ${value.tag}`);
    }
};
exports.assertListValue = assertListValue;
const assertRecordValue = (value) => {
    if (value.tag !== 'record') {
        throw new Error(`Expected record value, got ${value.tag}`);
    }
};
exports.assertRecordValue = assertRecordValue;
const assertFunctionValue = (value) => {
    if (value.tag !== 'function') {
        throw new Error(`Expected function value, got ${value.tag}`);
    }
};
exports.assertFunctionValue = assertFunctionValue;
const assertTupleValue = (value) => {
    if (value.tag !== 'tuple') {
        throw new Error(`Expected tuple value, got ${value.tag}`);
    }
};
exports.assertTupleValue = assertTupleValue;
const assertConstructorValue = (value) => {
    if (value.tag !== 'constructor') {
        throw new Error(`Expected constructor value, got ${value.tag}`);
    }
};
exports.assertConstructorValue = assertConstructorValue;
const assertNativeValue = (value) => {
    if (value.tag !== 'native') {
        throw new Error(`Expected native value, got ${value.tag}`);
    }
};
exports.assertNativeValue = assertNativeValue;
const assertTraitFunctionValue = (value) => {
    if (value.tag !== 'trait-function') {
        throw new Error(`Expected trait-function value, got ${value.tag}`);
    }
};
exports.assertTraitFunctionValue = assertTraitFunctionValue;
// Utility for asserting specific type kinds
const assertTypeKind = (expectedKind) => (type) => {
    if (type.kind !== expectedKind) {
        throw new Error(`Expected type kind '${expectedKind}', got '${type.kind}'`);
    }
};
exports.assertTypeKind = assertTypeKind;
// Utility for asserting specific value tags
const assertValueTag = (expectedTag) => (value) => {
    if (value.tag !== expectedTag) {
        throw new Error(`Expected value tag '${expectedTag}', got '${value.tag}'`);
    }
};
exports.assertValueTag = assertValueTag;
//# sourceMappingURL=utils.js.map