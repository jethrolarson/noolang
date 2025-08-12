import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';
import { parseTypeExpression } from '../parse-type';
import { test, expect, describe } from 'bun:test';
import {
	assertParseSuccess,
	assertParseError,
	assertRecordType,
	assertTupleType,
	assertListType,
	assertFunctionType,
	assertVariableType,
	assertDefinitionExpression,
	assertTypedExpression,
	assertPrimitiveType,
	assertVariantType,
	assertFunctionExpression,
	assertLiteralExpression,
} from '../../../test/utils';

// Helper functions for parsing
function parseType(typeSrc: string) {
	const lexer = new Lexer(typeSrc);
	const tokens = lexer.tokenize();
	return parseTypeExpression(tokens);
}

function parseDefinition(defSrc: string) {
	const lexer = new Lexer(defSrc);
	const tokens = lexer.tokenize();
	return parse(tokens);
}
describe('Type annotations', () => {
	describe('Top-level sequence parsing', () => {
		test('multiple definitions and final expression', () => {
			const lexer = new Lexer('a = 1; b = 2; a + b');
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			expect(program.statements.length).toBe(1);
			const seq = program.statements[0];
			expect(seq.kind).toBe('binary'); // semicolon sequence
		});

		test('multiple definitions and final record', () => {
			const code = `
      sum = fn x y => x + y;
      sub = fn x y => x - y;
      math = { @add sum, @sub sub };
      math
    `;
			const lexer = new Lexer(code);
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			expect(program.statements.length).toBe(1);
			const seq = program.statements[0];
			expect(seq.kind).toBe('binary');
		});

		test('sequence with trailing semicolon', () => {
			const lexer = new Lexer('a = 1; b = 2; a + b;');
			const tokens = lexer.tokenize();
			const program = parse(tokens);
			expect(program.statements.length).toBe(1);
			const seq = program.statements[0];
			expect(seq.kind).toBe('binary');
		});
	});

	describe('Type annotation parsing', () => {
		test(' parses record type annotation', () => {
			const result = parseType('{ name: String, age: Float }');
			assertParseSuccess(result);
			assertRecordType(result.value);
			expect(result.value.kind).toBe('record');
			expect(result.value.fields).toHaveProperty('name');
			expect(result.value.fields).toHaveProperty('age');
			expect(result.value.fields.name.kind).toBe('primitive');
			expect(result.value.fields.age.kind).toBe('primitive');
		});

		test(' parses tuple type annotation', () => {
			const result = parseType('{ Float, String }');
			assertParseSuccess(result);
			assertTupleType(result.value);
			assertPrimitiveType(result.value.elements[0]);
			assertPrimitiveType(result.value.elements[1]);
		});

		test(' parses list type annotation', () => {
			const result = parseType('List Float');
			assertParseSuccess(result);
			assertListType(result.value);
			assertPrimitiveType(result.value.element);
		});

		test(' parses function type annotation', () => {
			const result = parseType('Float -> Float');
			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			assertPrimitiveType(funcType.params[0]);
			assertPrimitiveType(funcType.return);
		});

		test(' parses type variable', () => {
			const result = parseType('a');
			assertParseSuccess(result);
			assertVariableType(result.value);
			expect(result.value.name).toBe('a');
		});

		test(' parses simple type constructor application', () => {
			const result = parseType('Option Float');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Option');
			assertPrimitiveType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('Float');
		});

		test(' parses type constructor with type variable', () => {
			const result = parseType('Option a');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Option');
			assertVariableType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('a');
		});

		test(' parses type constructor with multiple arguments', () => {
			const result = parseType('Either String Float');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Either');
			expect(variantType.args.length).toBe(2);
			assertPrimitiveType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('String');
			assertPrimitiveType(variantType.args[1]);
			expect(variantType.args[1].name).toBe('Float');
		});

		test(' parses nested type constructor application', () => {
			const result = parseType('Option (Either String Float)');
			assertParseSuccess(result);
			assertVariantType(result.value);
			const variantType = result.value;
			expect(variantType.name).toBe('Option');
			expect(variantType.args.length).toBe(1);
			assertVariantType(variantType.args[0]);
			expect(variantType.args[0].name).toBe('Either');
			expect(variantType.args[0].args.length).toBe(2);
		});
	});
	describe('Effect parsing', () => {
		test('should parse function type with single effect', () => {
			const result = parseType('Float -> Float !write');

			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			expect([...funcType.effects]).toEqual(['write']);
			expect(funcType.params.length).toBe(1);
			expect(funcType.params[0].kind).toBe('primitive');
			expect(funcType.return.kind).toBe('primitive');
		});

		test('should parse function type with multiple effects', () => {
			const result = parseType('Float -> String !write !log');

			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			expect([...funcType.effects].sort()).toEqual(['log', 'write']);
		});

		test('should parse function type with all valid effects', () => {
			const result = parseType(
				'Float -> Float !log !read !write !state !time !rand !ffi !async'
			);

			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			expect([...funcType.effects].sort()).toEqual([
				'async',
				'ffi',
				'log',
				'rand',
				'read',
				'state',
				'time',
				'write',
			]);
		});

		test('should parse function type with no effects', () => {
			const result = parseType('Float -> Float');

			assertParseSuccess(result);
			assertFunctionType(result.value);
			const funcType = result.value;
			expect([...funcType.effects]).toEqual([]);
		});

		test('should reject invalid effect names', () => {
			const result = parseType('Float -> Float !invalid');

			assertParseError(result);
			expect(result.error.includes('Invalid effect: invalid')).toBeTruthy();
		});

		test('should require effect name after exclamation mark', () => {
			const result = parseType('Float -> Float !');

			assertParseError(result);
			expect(
				result.error.includes('Expected effect name after !')
			).toBeTruthy();
		});
	});
	describe('Top-level definitions with type annotations', () => {
		test('parses definition with function type annotation', () => {
			const result = parseDefinition(
				'sum = fn x y => x + y : Float -> Float -> Float;'
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			expect(def.name).toBe('sum');
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
		});

		test('parses definition with primitive type annotation', () => {
			const result = parseDefinition('answer = 42 : Float;');
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			expect(def.name).toBe('answer');
			const typed = def.value;
			assertTypedExpression(typed);
			assertLiteralExpression(typed.expression);
			assertPrimitiveType(typed.type);
		});

		test('parses definition with list type annotation', () => {
			const result = parseDefinition('numbers = [1, 2, 3] : List Float');
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			expect(def.name).toBe('numbers');
			const typed = def.value;
			assertTypedExpression(typed);
			assertListType(typed.type);
			assertPrimitiveType(typed.type.element);
			expect(typed.type.element.name).toBe('Float');
		});
	});

	test('Function type annotation after lambda body binds to the lambda (not the body)', () => {
		const code = `
map_err = fn f res => match res (
  Ok x => Ok x;
  Err e => Err (f e)
) : (b -> c) -> Result a b -> Result a c
`;
		const result = parseDefinition(code);
		expect(result.statements.length).toBe(1);
		const def = result.statements[0];
		assertDefinitionExpression(def);
		// We expect the definition value to be a typed expression wrapping a function
		assertTypedExpression(def.value);
		assertFunctionExpression(def.value.expression);
	});

	test('Lambda type annotation after simple body binds to the lambda', () => {
		const code = `
add_func = fn x y => x + y : Float -> Float -> Float;
`;
		const result = parseDefinition(code);
		expect(result.statements.length).toBe(1);
		const def = result.statements[0];
		assertDefinitionExpression(def);
		assertTypedExpression(def.value);
		assertFunctionExpression(def.value.expression);
	});

	describe('Battle tests for function annotation precedence', () => {
		test('Complex nested match expression with type annotation', () => {
			const code = `
complex_fn = fn f g x => 
  match (f x) (
    Some y => match (g y) (
      Ok z => Some z;
      Err _ => None
    );
    None => None
  ): (a -> Option b) -> (b -> Result c String) -> a -> Option c
`;
			const result = parseDefinition(code);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Verify the type annotation structure
			expect(def.value.type.kind).toBe('function');
		});

		test('Lambda with where clause and type annotation', () => {
			const result = parseDefinition(
				`where_fn = fn x => result where (doubled = x * 2; result = doubled + 10) : Float -> Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be a where expression
			expect(def.value.expression.body.kind).toBe('where');
		});

		test('Lambda with if-then-else and type annotation (requires parentheses)', () => {
			// Due to operator precedence, if-then-else requires parentheses
			const result = parseDefinition(
				`conditional_fn = fn x => (if x > 0 then x * 2 else x / 2) : Float -> Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be an if expression
			expect(def.value.expression.body.kind).toBe('if');
		});

		test('Lambda with pipeline operators and type annotation', () => {
			const result = parseDefinition(
				`pipeline_fn = fn list => list |> filter (fn x => x > 0) |> map (fn x => x * 2) : List Float -> List Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be a pipeline expression
			expect(def.value.expression.body.kind).toBe('pipeline');
		});

		test('Lambda with thrush operator and type annotation', () => {
			const result = parseDefinition(
				`thrush_fn = fn x => x | add 10 | multiply 2 : Float -> Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be a binary expression (thrush)
			expect(def.value.expression.body.kind).toBe('binary');
			if (def.value.expression.body.kind === 'binary') {
				expect(def.value.expression.body.operator).toBe('|');
			}
		});

		test('Lambda with dollar operator and type annotation', () => {
			const result = parseDefinition(
				`dollar_fn = fn x => map (add 1) $ filter (gt 0) $ [x, x+1, x+2] : Float -> List Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should contain dollar operator
			expect(def.value.expression.body.kind).toBe('binary');
			if (def.value.expression.body.kind === 'binary') {
				expect(def.value.expression.body.operator).toBe('$');
			}
		});

		test('Nested lambda definitions with type annotations (requires parentheses)', () => {
			// Due to operator precedence, nested lambdas with types require parentheses
			const result = parseDefinition(
				`outer_fn = fn x => (fn y => x + y : Float -> Float) : Float -> (Float -> Float)`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Inner lambda should also be typed
			expect(def.value.expression.body.kind).toBe('typed');
			if (def.value.expression.body.kind === 'typed') {
				expect(def.value.expression.body.expression.kind).toBe('function');
			}
		});

		test('Lambda with arithmetic expressions and type annotation', () => {
			const result = parseDefinition(
				`math_fn = fn x y => (x * 2 + y) / (x - y + 1) : Float -> Float -> Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be a binary expression (division)
			expect(def.value.expression.body.kind).toBe('binary');
			if (def.value.expression.body.kind === 'binary') {
				expect(def.value.expression.body.operator).toBe('/');
			}
		});

		test('Lambda with function application and type annotation', () => {
			const result = parseDefinition(
				`app_fn = fn f x => f (f x) : (a -> a) -> a -> a`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be an application
			expect(def.value.expression.body.kind).toBe('application');
		});

		test('Lambda with list construction and type annotation', () => {
			const result = parseDefinition(
				`list_fn = fn x => [x, x+1, x+2, x*2] : Float -> List Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be a list
			expect(def.value.expression.body.kind).toBe('list');
			if (def.value.expression.body.kind === 'list') {
				expect(def.value.expression.body.elements.length).toBe(4);
			}
		});

		test('Lambda with record construction and type annotation', () => {
			const result = parseDefinition(
				`record_fn = fn x y => { @x x, @y y, @sum (x + y) } : Float -> Float -> { @x Float, @y Float, @sum Float }`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be a record
			expect(def.value.expression.body.kind).toBe('record');
			if (def.value.expression.body.kind === 'record') {
				expect(def.value.expression.body.fields.length).toBe(3);
			}
		});

		test('Lambda with accessor chaining and type annotation', () => {
			const result = parseDefinition(
				`accessor_fn = fn obj => obj | @user | @profile | @name : { @user { @profile { @name String } } } -> String`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be thrush operators with accessors
			expect(def.value.expression.body.kind).toBe('binary');
			if (def.value.expression.body.kind === 'binary') {
				expect(def.value.expression.body.operator).toBe('|');
			}
		});

		test('Lambda with unary minus and type annotation', () => {
			const result = parseDefinition(
				`neg_fn = fn x => -x * 2 : Float -> Float`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should handle unary minus correctly
			expect(def.value.expression.body.kind).toBe('binary');
		});

		test('Type annotation with effects', () => {
			const result = parseDefinition(
				`effectful_fn = fn msg => print msg : String -> String !write`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Type should have effects
			expect(def.value.type.kind).toBe('function');
			if (def.value.type.kind === 'function' && 'effects' in def.value.type) {
				expect([...def.value.type.effects]).toContain('write');
			}
		});

		test('Complex lambda with import and type annotation', () => {
			const result = parseDefinition(
				`import_fn = fn filename => import "some/path" : String -> Module`
			);
			expect(result.statements.length).toBe(1);
			const def = result.statements[0];
			assertDefinitionExpression(def);
			assertTypedExpression(def.value);
			assertFunctionExpression(def.value.expression);
			// Body should be an import expression
			expect(def.value.expression.body.kind).toBe('import');
		});
	});
});
