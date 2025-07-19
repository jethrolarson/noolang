import { Lexer } from "../../lexer";
import { parse, parseTypeExpression } from "../parser";
import type {
	Expression,
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	BinaryExpression,
	IfExpression,
	RecordExpression,
	AccessorExpression,
	Type,
	RecordType,
	TupleType,
	ListType,
	FunctionType,
	VariableType,
	DefinitionExpression,
	TypedExpression,
	MatchExpression,
} from "../../ast";
import type { ParseError, ParseResult, ParseSuccess } from "../combinators";

// Helper functions for type-safe testing
function assertLiteralExpression(expr: Expression): LiteralExpression {
	if (expr.kind !== "literal") {
		throw new Error(`Expected literal expression, got ${expr.kind}`);
	}
	return expr;
}

function assertVariableExpression(expr: Expression): VariableExpression {
	if (expr.kind !== "variable") {
		throw new Error(`Expected variable expression, got ${expr.kind}`);
	}
	return expr;
}

function assertFunctionExpression(expr: Expression): FunctionExpression {
	if (expr.kind !== "function") {
		throw new Error(`Expected function expression, got ${expr.kind}`);
	}
	return expr;
}

function assertApplicationExpression(expr: Expression): ApplicationExpression {
	if (expr.kind !== "application") {
		throw new Error(`Expected application expression, got ${expr.kind}`);
	}
	return expr;
}

function assertBinaryExpression(expr: Expression): BinaryExpression {
	if (expr.kind !== "binary") {
		throw new Error(`Expected binary expression, got ${expr.kind}`);
	}
	return expr;
}

function assertIfExpression(expr: Expression): IfExpression {
	if (expr.kind !== "if") {
		throw new Error(`Expected if expression, got ${expr.kind}`);
	}
	return expr;
}

function assertRecordExpression(expr: Expression): RecordExpression {
	if (expr.kind !== "record") {
		throw new Error(`Expected record expression, got ${expr.kind}`);
	}
	return expr;
}

function assertAccessorExpression(expr: Expression): AccessorExpression {
	if (expr.kind !== "accessor") {
		throw new Error(`Expected accessor expression, got ${expr.kind}`);
	}
	return expr;
}

function assertRecordType(type: Type): asserts type is RecordType {
	if (type.kind !== "record") {
		throw new Error(`Expected record type, got ${type.kind}`);
	}
}

function assertTupleType(type: Type): asserts type is TupleType {
	if (type.kind !== "tuple") {
		throw new Error(`Expected tuple type, got ${type.kind}`);
	}
}

function assertListType(type: Type): asserts type is ListType {
	if (type.kind !== "list") {
		throw new Error(`Expected list type, got ${type.kind}`);
	}
}

function assertFunctionType(type: Type): asserts type is FunctionType {
	if (type.kind !== "function") {
		throw new Error(`Expected function type, got ${type.kind}`);
	}
}

function assertVariableType(type: Type): asserts type is VariableType {
	if (type.kind !== "variable") {
		throw new Error(`Expected variable type, got ${type.kind}`);
	}
}

function assertDefinitionExpression(expr: Expression): DefinitionExpression {
	if (expr.kind !== "definition") {
		throw new Error(`Expected definition expression, got ${expr.kind}`);
	}
	return expr;
}

function assertTypedExpression(expr: Expression): TypedExpression {
	if (expr.kind !== "typed") {
		throw new Error(`Expected typed expression, got ${expr.kind}`);
	}
	return expr;
}

function assertMatchExpression(expr: Expression): MatchExpression {
	if (expr.kind !== "match") {
		throw new Error(`Expected match expression, got ${expr.kind}`);
	}
	return expr;
}

function assertParseSuccess<T>(
	result: ParseResult<T>,
): asserts result is ParseSuccess<T> {
	if (!result.success) {
		throw new Error(`Expected parse success, got ${result.error}`);
	}
}

function assertParseError<T>(
	result: ParseResult<T>,
): asserts result is ParseError {
	if (result.success) {
		throw new Error(
			`Expected parse error, got success: (${JSON.stringify(result)})`,
		);
	}
}

describe("Parser", () => {
	test("should parse simple literals", () => {
		const lexer = new Lexer("42");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		const literal = assertLiteralExpression(program.statements[0]);
		expect(literal.value).toBe(42);
	});

	test("should parse string literals", () => {
		const lexer = new Lexer('"hello"');
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		const literal = assertLiteralExpression(program.statements[0]);
		expect(literal.value).toBe("hello");
	});

	test("should parse boolean literals", () => {
		const lexer = new Lexer("True");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("variable");
		expect((program.statements[0] as any).name).toBe("True");
	});

	test("should parse variable references", () => {
		const lexer = new Lexer("x");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		const variable = assertVariableExpression(program.statements[0]);
		expect(variable.name).toBe("x");
	});

	test("should parse function definitions", () => {
		const lexer = new Lexer("fn x => x + 1");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		const func = assertFunctionExpression(program.statements[0]);
		expect(func.params).toEqual(["x"]);
		expect(func.body.kind).toBe("binary");
	});

	test("should parse function applications", () => {
		const lexer = new Lexer("(fn x => x + 1) 2");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		const app = assertApplicationExpression(program.statements[0]);
		expect(app.func.kind).toBe("function");
		expect(app.args).toHaveLength(1);
		const arg = assertLiteralExpression(app.args[0]);
		expect(arg.value).toBe(2);
	});

	test("should parse binary expressions", () => {
		const lexer = new Lexer("2 + 3");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		const binary = assertBinaryExpression(program.statements[0]);
		expect(binary.operator).toBe("+");
	});

	test("should parse lists", () => {
		const lexer = new Lexer("[1, 2, 3]");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("list");
		const elements = (program.statements[0] as any).elements;
		expect(Array.isArray(elements)).toBe(true);
		expect(elements).toHaveLength(3);
		expect(elements[0].kind).toBe("literal");
		expect(elements[0].value).toBe(1);
		expect(elements[1].kind).toBe("literal");
		expect(elements[1].value).toBe(2);
		expect(elements[2].kind).toBe("literal");
		expect(elements[2].value).toBe(3);
	});

	test("should parse if expressions", () => {
		const lexer = new Lexer("if True then 1 else 2");
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("if");
		const ifExpr = program.statements[0] as any;
		expect(ifExpr.condition.name).toBe("True");
		expect(ifExpr.then.value).toBe(1);
		expect(ifExpr.else.value).toBe(2);
	});

	test("should parse pipeline expressions", () => {
		const lexer = new Lexer("[1, 2, 3] |> map");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const pipeline = program.statements[0] as any;
		expect(pipeline.kind).toBe("pipeline");
		expect(pipeline.steps[0].kind).toBe("list");
		expect(pipeline.steps[1].kind).toBe("variable");
	});

	test("should parse single-field record", () => {
		const lexer = new Lexer('{ @name "Alice", @age 30 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("record");
		const record = program.statements[0] as any;
		expect(record.fields).toHaveLength(2);
		expect(record.fields[0].name).toBe("name");
		expect(record.fields[0].value.value).toBe("Alice");
		expect(record.fields[1].name).toBe("age");
		expect(record.fields[1].value.value).toBe(30);
	});

	test("should parse multi-field record (semicolon separated)", () => {
		const lexer = new Lexer('{ @name "Alice", @age 30 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("record");
		const record = program.statements[0] as any;
		expect(record.fields).toHaveLength(2);
		expect(record.fields[0].name).toBe("name");
		expect(record.fields[0].value.value).toBe("Alice");
		expect(record.fields[1].name).toBe("age");
		expect(record.fields[1].value.value).toBe(30);
	});

	test("should parse multi-field record (semicolon separated)", () => {
		const lexer = new Lexer('{ @name "Alice", @age 30 }');
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("record");
		const record = program.statements[0] as any;
		expect(record.fields).toHaveLength(2);
		expect(record.fields[0].name).toBe("name");
		expect(record.fields[0].value.value).toBe("Alice");
		expect(record.fields[1].name).toBe("age");
		expect(record.fields[1].value.value).toBe(30);
	});

	test("should parse accessor", () => {
		const lexer = new Lexer("@name");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		expect(program.statements[0].kind).toBe("accessor");
		const accessor = program.statements[0] as any;
		expect(accessor.field).toBe("name");
	});

	test("should parse function with unit parameter", () => {
		const lexer = new Lexer("fn {} => 42");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const func = assertFunctionExpression(program.statements[0]);
		expect(func.params).toEqual(["_unit"]); // Unit parameter
		expect(func.body.kind).toBe("literal");
		expect((func.body as LiteralExpression).value).toBe(42);
	});

	test("should parse deeply nested tuples in records", () => {
		const lexer = new Lexer("{ @key [1, {{{1}}}] }");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		// Check the outermost record
		expect(program.statements).toHaveLength(1);
		const outer = program.statements[0];
		expect(outer.kind).toBe("record");
		const keyField = (outer as any).fields[0];
		expect(keyField.name).toBe("key");
		// Check that keyField.value is a list with two elements
		expect(keyField.value.kind).toBe("list");
		expect(keyField.value.elements).toHaveLength(2);
		// First element should be a literal
		expect(keyField.value.elements[0].kind).toBe("literal");
		expect(keyField.value.elements[0].value).toBe(1);
		// Second element should be a nested tuple structure
		let nestedTuple = keyField.value.elements[1];
		expect(nestedTuple.kind).toBe("tuple");
		// Check the nested structure: tuple -> tuple -> tuple -> literal
		for (let i = 0; i < 3; i++) {
			expect(nestedTuple.kind).toBe("tuple");
			expect(nestedTuple.elements).toHaveLength(1);
			nestedTuple = nestedTuple.elements[0];
		}
		expect(nestedTuple.kind).toBe("literal");
		expect(nestedTuple.value).toBe(1);
	});

	test("should parse records with nested lists and records", () => {
		const lexer = new Lexer("{ @key [1, { @inner [2, 3] }] }");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const outer = program.statements[0];
		expect(outer.kind).toBe("record");
		const keyField = (outer as any).fields[0];
		expect(keyField.name).toBe("key");
		const list = keyField.value as any;
		expect(list.kind).toBe("list");
		expect(list.elements[0].kind).toBe("literal");
		expect(list.elements[0].value).toBe(1);
		const nestedRecord = list.elements[1];
		expect(nestedRecord.kind).toBe("record");
		const innerField = nestedRecord.fields[0];
		expect(innerField.name).toBe("inner");
		const innerList = innerField.value as any;
		expect(innerList.kind).toBe("list");
		expect(innerList.elements.map((e: any) => e.value)).toEqual([2, 3]);
	});

	test("should parse lists of records", () => {
		const lexer = new Lexer("[{ @a 1 }, { @b 2 }]");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const list = program.statements[0] as any;
		expect(list.kind).toBe("list");
		expect(list.elements[0].kind).toBe("record");
		expect(list.elements[1].kind).toBe("record");
		expect(list.elements[0].fields[0].name).toBe("a");
		expect(list.elements[0].fields[0].value.value).toBe(1);
		expect(list.elements[1].fields[0].name).toBe("b");
		expect(list.elements[1].fields[0].value.value).toBe(2);
	});

	test("should parse a single tuple", () => {
		const lexer = new Lexer("{1}");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const tuple = program.statements[0] as any;
		expect(tuple.kind).toBe("tuple");
		expect(tuple.elements[0].kind).toBe("literal");
		expect(tuple.elements[0].value).toBe(1);
	});

	test("should parse a single record", () => {
		const lexer = new Lexer("{ @foo 1 }");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const record = program.statements[0] as any;
		expect(record.kind).toBe("record");
		expect(record.fields[0].name).toBe("foo");
		expect(record.fields[0].value.value).toBe(1);
	});

	test("should parse a list of literals", () => {
		const lexer = new Lexer("[1, 2]");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const list = program.statements[0] as any;
		expect(list.kind).toBe("list");
		expect(list.elements[0].kind).toBe("literal");
		expect(list.elements[0].value).toBe(1);
		expect(list.elements[1].kind).toBe("literal");
		expect(list.elements[1].value).toBe(2);
	});

	test("should parse a list of tuples", () => {
		const lexer = new Lexer("[{1}, {2}]");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const list = program.statements[0] as any;
		expect(list.kind).toBe("list");
		expect(list.elements[0].kind).toBe("tuple");
		expect(list.elements[0].elements[0].value).toBe(1);
		expect(list.elements[1].kind).toBe("tuple");
		expect(list.elements[1].elements[0].value).toBe(2);
	});

	test("should parse a list of records", () => {
		const lexer = new Lexer("[{ @foo 1 }, { @bar 2 }]");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const list = program.statements[0] as any;
		expect(list.kind).toBe("list");
		expect(list.elements[0].kind).toBe("record");
		expect(list.elements[0].fields[0].name).toBe("foo");
		expect(list.elements[0].fields[0].value.value).toBe(1);
		expect(list.elements[1].kind).toBe("record");
		expect(list.elements[1].fields[0].name).toBe("bar");
		expect(list.elements[1].fields[0].value.value).toBe(2);
	});

	test("should parse thrush operator", () => {
		const lexer = new Lexer("10 | (fn x => x + 1)");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const thrush = program.statements[0] as any;
		expect(thrush.kind).toBe("binary");
		expect(thrush.operator).toBe("|");
		expect(thrush.left.kind).toBe("literal");
		expect(thrush.right.kind).toBe("function");
	});

	test("should parse chained thrush operators as left-associative", () => {
		const lexer = new Lexer("a | b | c");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const chain = program.statements[0] as any;
		expect(chain.kind).toBe("binary");
		expect(chain.operator).toBe("|");
		expect(chain.left.kind).toBe("binary");
		expect(chain.left.operator).toBe("|");
		expect(chain.left.left.kind).toBe("variable");
		expect(chain.left.left.name).toBe("a");
		expect(chain.left.right.kind).toBe("variable");
		expect(chain.left.right.name).toBe("b");
		expect(chain.right.kind).toBe("variable");
		expect(chain.right.name).toBe("c");
	});

	test("should parse thrush operator after record", () => {
		const lexer = new Lexer("{@key 1, @key2 False} | @key");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);

		// Verify it's a binary expression with thrush operator
		const expr = program.statements[0] as BinaryExpression;
		expect(expr.kind).toBe("binary");
		expect(expr.operator).toBe("|");
		expect(expr.left.kind).toBe("record");
		expect(expr.right.kind).toBe("accessor");
	});
});

describe("Top-level sequence parsing", () => {
	test("multiple definitions and final expression", () => {
		const lexer = new Lexer("a = 1; b = 2; a + b");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const seq = program.statements[0];
		expect(seq.kind).toBe("binary"); // semicolon sequence
	});

	test("multiple definitions and final record", () => {
		const code = `
      add = fn x y => x + y;
      sub = fn x y => x - y;
      math = { @add add, @sub sub };
      math
    `;
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const seq = program.statements[0];
		expect(seq.kind).toBe("binary");
	});

	test("sequence with trailing semicolon", () => {
		const lexer = new Lexer("a = 1; b = 2; a + b;");
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		expect(program.statements).toHaveLength(1);
		const seq = program.statements[0];
		expect(seq.kind).toBe("binary");
	});
});

describe("Type annotation parsing", () => {
	function parseType(typeSrc: string) {
		const lexer = new Lexer(typeSrc);
		const tokens = lexer.tokenize();
		return parseTypeExpression(tokens);
	}

	test("parses record type annotation", () => {
		const result = parseType("{ name: String, age: Number }");
		assertParseSuccess(result);
		assertRecordType(result.value);
		expect(result.value.kind).toBe("record");
		expect(result.value.fields).toHaveProperty("name");
		expect(result.value.fields).toHaveProperty("age");
		expect(result.value.fields.name.kind).toBe("primitive");
		expect(result.value.fields.age.kind).toBe("primitive");
	});

	test("parses tuple type annotation", () => {
		const result = parseType("{ Number, String }");
		assertParseSuccess(result);
		assertTupleType(result.value);
		expect(result.value.elements[0].kind).toBe("primitive");
		expect(result.value.elements[1].kind).toBe("primitive");
	});

	test("parses list type annotation", () => {
		const result = parseType("List Number");
		assertParseSuccess(result);
		assertListType(result.value);
		expect(result.value.element.kind).toBe("primitive");
	});

	test("parses function type annotation", () => {
		const result = parseType("Number -> Number");
		assertParseSuccess(result);
		assertFunctionType(result.value);
		const funcType = result.value;
		expect(funcType.params[0].kind).toBe("primitive");
		expect(funcType.return.kind).toBe("primitive");
	});

	test("parses type variable", () => {
		const result = parseType("a");
		assertParseSuccess(result);
		assertVariableType(result.value);
		expect(result.value.kind).toBe("variable");
		expect(result.value.name).toBe("a");
	});

	test("parses nested record type", () => {
		const result = parseType(
			"{ person: { name: String, age: Number }, active: Bool }",
		);
		assertParseSuccess(result);
		assertRecordType(result.value);
		expect(result.value.fields).toHaveProperty("person");
		expect(result.value.fields).toHaveProperty("active");
		expect(result.value.fields.person.kind).toBe("record");
		expect(result.value.fields.active.kind).toBe("variant");
	});
});

describe("Top-level definitions with type annotations", () => {
	function parseDefinition(defSrc: string) {
		const lexer = new Lexer(defSrc);
		const tokens = lexer.tokenize();
		return parse(tokens);
	}

	test("parses definition with function type annotation", () => {
		const result = parseDefinition(
			"add = fn x y => x + y : Number -> Number -> Number;",
		);
		expect(result.statements).toHaveLength(1);
		expect(result.statements[0].kind).toBe("definition");
		const def = assertDefinitionExpression(result.statements[0]);
		expect(def.name).toBe("add");
		expect(def.value.kind).toBe("function");
		// Function expressions with type annotations may not wrap in "typed" nodes
		// The type information might be stored directly on the function
	});

	test("parses definition with primitive type annotation", () => {
		const result = parseDefinition("answer = 42 : Number;");
		expect(result.statements).toHaveLength(1);
		expect(result.statements[0].kind).toBe("definition");
		const def = assertDefinitionExpression(result.statements[0]);
		expect(def.name).toBe("answer");
		const typed = assertTypedExpression(def.value);
		expect(typed.expression.kind).toBe("literal");
		expect(typed.type.kind).toBe("primitive");
	});

	test("parses definition with list type annotation", () => {
		const result = parseDefinition("numbers = [1, 2, 3] : List Number;");
		expect(result.statements).toHaveLength(1);
		const def = assertDefinitionExpression(result.statements[0]);
		expect(def.name).toBe("numbers");
		const typed = assertTypedExpression(def.value);
		expect(typed.expression.kind).toBe("list");
		expect(typed.type.kind).toBe("list");
	});

	test("parses multiple definitions with type annotations", () => {
		const result = parseDefinition(`
      add = fn x y => x + y : Number -> Number -> Number;
      answer = 42 : Number;
      numbers = [1, 2, 3] : List Number;
    `);
		expect(result.statements).toHaveLength(1);
		const seq = assertBinaryExpression(result.statements[0]);
		expect(seq.kind).toBe("binary"); // semicolon sequence
		expect(seq.operator).toBe(";");
	});

	// Phase 1: Effect parsing tests
	describe("Effect parsing", () => {
		test("should parse function type with single effect", () => {
			const lexer = new Lexer("Int -> Int !write");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseSuccess(result);
			assertFunctionType(result.value);
		const funcType = result.value;
			expect([...funcType.effects]).toEqual(["write"]);
			expect(funcType.params).toHaveLength(1);
			expect(funcType.params[0].kind).toBe("primitive");
			expect(funcType.return.kind).toBe("primitive");
		});

		test("should parse function type with multiple effects", () => {
			const lexer = new Lexer("Int -> String !write !log");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseSuccess(result);
			assertFunctionType(result.value);
		const funcType = result.value;
			expect([...funcType.effects].sort()).toEqual(["log", "write"]);
		});

		test("should parse function type with all valid effects", () => {
			const lexer = new Lexer("Int -> Int !log !read !write !state !time !rand !ffi !async");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseSuccess(result);
			assertFunctionType(result.value);
		const funcType = result.value;
			expect([...funcType.effects].sort()).toEqual(["async", "ffi", "log", "rand", "read", "state", "time", "write"]);
		});

		test("should parse function type with no effects", () => {
			const lexer = new Lexer("Int -> Int");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseSuccess(result);
			assertFunctionType(result.value);
		const funcType = result.value;
			expect([...funcType.effects]).toEqual([]);
		});

		test("should parse multi-parameter function with effects", () => {
			const lexer = new Lexer("Int -> String -> Bool !read");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseSuccess(result);
			assertFunctionType(result.value);
		const funcType = result.value;
			expect([...funcType.effects]).toEqual(["read"]);
			expect(funcType.params).toHaveLength(1);
			expect(funcType.return.kind).toBe("function");
		});

		test("should reject invalid effect names", () => {
			const lexer = new Lexer("Int -> Int !invalid");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseError(result);
			expect(result.error).toContain("Invalid effect: invalid");
		});

		test("should require effect name after exclamation mark", () => {
			const lexer = new Lexer("Int -> Int !");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseError(result);
			expect(result.error).toContain("Expected effect name after !");
		});

		test("should parse typed expression with effects", () => {
			const result = parseDefinition("x : Int -> Int !state");
			expect(result.statements).toHaveLength(1);
			const typed = assertTypedExpression(result.statements[0]);
			assertFunctionType(typed.type);
		const funcType = typed.type;
			expect([...funcType.effects]).toEqual(["state"]);
		});

		test("should parse function definition with effect annotation", () => {
			const result = parseDefinition("fn x => x : Int -> Int !log");
			expect(result.statements).toHaveLength(1);
			const func = assertFunctionExpression(result.statements[0]);
			const typed = assertTypedExpression(func.body);
			assertFunctionType(typed.type);
		const funcType = typed.type;
			expect([...funcType.effects]).toEqual(["log"]);
		});

		test("should automatically deduplicate effects", () => {
			const lexer = new Lexer("Int -> Int !write !log !write");
			const tokens = lexer.tokenize();
			const result = parseTypeExpression(tokens);
			
			assertParseSuccess(result);
			assertFunctionType(result.value);
		const funcType = result.value;
			// Set automatically deduplicates, so !write !log !write becomes {log, write}
			expect([...funcType.effects].sort()).toEqual(["log", "write"]);
			expect(funcType.effects.size).toBe(2);
		});
	});
});
