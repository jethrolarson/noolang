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
} from "../src/ast";
import type {
	ParseError,
	ParseResult,
	ParseSuccess,
} from "../src/parser/combinators";

export const assertKind =
	<T extends { kind: string }, K extends T["kind"]>(expectedKind: K) =>
	(value: T): asserts value is Extract<T, { kind: K }> => {
		if (value.kind !== expectedKind) {
			throw new Error(`Expected kind '${expectedKind}', got '${value.kind}'`);
		}
	};

export const assertLiteralExpression = assertKind<LiteralExpression, "literal">(
	"literal",
);
export const assertVariableExpression = assertKind<
	VariableExpression,
	"variable"
>("variable");
export const assertFunctionExpression = assertKind<
	FunctionExpression,
	"function"
>("function");
export const assertApplicationExpression = assertKind<
	ApplicationExpression,
	"application"
>("application");
export const assertBinaryExpression = assertKind<BinaryExpression, "binary">(
	"binary",
);
export const assertIfExpression = assertKind<IfExpression, "if">("if");
export const assertRecordExpression = assertKind<RecordExpression, "record">(
	"record",
);
export const assertAccessorExpression = assertKind<
	AccessorExpression,
	"accessor"
>("accessor");

export const assertRecordType = assertKind<RecordType, "record">("record");
export const assertTupleType = assertKind<TupleType, "tuple">("tuple");
export const assertListType = assertKind<ListType, "list">("list");
export const assertFunctionType = assertKind<FunctionType, "function">(
	"function",
);
export const assertVariableType = assertKind<VariableType, "variable">(
	"variable",
);

export const assertDefinitionExpression = assertKind<
	DefinitionExpression,
	"definition"
>("definition");
export const assertTypedExpression = assertKind<TypedExpression, "typed">(
	"typed",
);
export const assertMatchExpression = assertKind<MatchExpression, "match">(
	"match",
);

export const assertParseSuccess = <T>(
	result: ParseResult<T>,
): asserts result is ParseSuccess<T> => {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
};

export const assertParseError = <T>(
	result: ParseResult<T>,
): asserts result is ParseError => {
	if (result.success) {
		throw new Error(
			`Expected parse error, got success: (${JSON.stringify(result)})`,
		);
	}
};
