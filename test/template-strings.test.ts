import { test, expect, describe } from 'bun:test';
import { Lexer } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import {
	expectSuccess,
	expectError,
	parseAndType,
	runCode,
	assertBinaryExpression,
	assertApplicationExpression,
	assertVariableExpression,
	assertLiteralExpression,
} from './utils';
import { typeToString } from '../src/typer/helpers';

describe('template strings — lexer', () => {
	test('template with a hole produces template tokens around normal hole tokens', () => {
		const tokens = new Lexer('`a ${x} b`').tokenize();
		expect(tokens.map(t => [t.type, t.value])).toEqual([
			['TEMPLATE_START', '`'],
			['TEMPLATE_TEXT', 'a '],
			['TEMPLATE_HOLE_START', '${'],
			['IDENTIFIER', 'x'],
			['TEMPLATE_HOLE_END', '}'],
			['TEMPLATE_TEXT', ' b'],
			['TEMPLATE_END', '`'],
			['EOF', ''],
		]);
	});

	test('record braces inside a hole do not end the hole', () => {
		const tokens = new Lexer('`${{@a 1}}`').tokenize();
		const types = tokens.map(t => t.type);
		// the final `}` before TEMPLATE_END must be the hole end, and the
		// record's braces must lex as ordinary punctuation
		expect(types).toEqual([
			'TEMPLATE_START',
			'TEMPLATE_HOLE_START',
			'PUNCTUATION', // {
			'ACCESSOR', // @a
			'NUMBER', // 1
			'PUNCTUATION', // }
			'TEMPLATE_HOLE_END',
			'TEMPLATE_END',
			'EOF',
		]);
	});

	test('escapes: backtick, dollar, and standard string escapes', () => {
		const tokens = new Lexer('`\\` \\${ \\n \\t`').tokenize();
		expect(tokens[1].type).toBe('TEMPLATE_TEXT');
		expect(tokens[1].value).toBe('` ${ \n \t');
	});

	test('lone dollar not followed by brace is literal text', () => {
		const tokens = new Lexer('`cost: $5`').tokenize();
		expect(tokens[1].value).toBe('cost: $5');
	});

	test('double quotes and newlines are plain text inside a template', () => {
		const tokens = new Lexer('`say "hi"\nagain`').tokenize();
		expect(tokens[1].value).toBe('say "hi"\nagain');
	});
});

describe('template strings — parser desugar', () => {
	test('desugars to + of string parts and show-wrapped holes', () => {
		const tokens = new Lexer('`a ${x} b`').tokenize();
		const program = parse(tokens);
		const expr = program.statements[0];
		// ("a " + show x) + " b"
		assertBinaryExpression(expr);
		expect(expr.operator).toBe('+');
		assertLiteralExpression(expr.right);
		expect(expr.right.value).toBe(' b');
		assertBinaryExpression(expr.left);
		assertLiteralExpression(expr.left.left);
		expect(expr.left.left.value).toBe('a ');
		assertApplicationExpression(expr.left.right);
		assertVariableExpression(expr.left.right.func);
		expect(expr.left.right.func.name).toBe('show');
	});

	test('hole expression keeps its source location for error reporting', () => {
		const tokens = new Lexer('`abc ${foo 1} d`').tokenize();
		const program = parse(tokens);
		const expr = program.statements[0];
		assertBinaryExpression(expr);
		assertBinaryExpression(expr.left);
		assertApplicationExpression(expr.left.right); // show (foo 1)
		const holeExpr = expr.left.right.args[0];
		// `abc ${foo 1} d`  — "foo" starts at column 8
		expect(holeExpr.location.start.column).toBe(8);
		// and the synthesized show call points at the hole too, not column 1
		expect(expr.left.right.location.start.column).toBe(8);
	});

	test('template with no holes is a plain string literal', () => {
		const tokens = new Lexer('`just text`').tokenize();
		const program = parse(tokens);
		const expr = program.statements[0];
		assertLiteralExpression(expr);
		expect(expr.value).toBe('just text');
	});

	test('empty template is the empty string', () => {
		const tokens = new Lexer('``').tokenize();
		const program = parse(tokens);
		const expr = program.statements[0];
		assertLiteralExpression(expr);
		expect(expr.value).toBe('');
	});

	test('unterminated template is a parse error', () => {
		const tokens = new Lexer('`oops ${x}').tokenize();
		expect(() => parse(tokens)).toThrow(/template/i);
	});
});

describe('template strings — end to end', () => {
	test('string hole interpolates identically (Show String is identity)', () => {
		expectSuccess('name = "world"; `hello ${name}!`', 'hello world!');
	});

	test('numeric expression hole goes through show', () => {
		expectSuccess('`n = ${1 + 2}`', 'n = 3');
	});

	test('record expression inside a hole', () => {
		expectSuccess('`${{@a 1} | @a}`', '1');
	});

	test('hole-only template is still a String', () => {
		const result = runCode('`${42}`');
		expect(result.finalValue).toBe('42');
		expect(result.finalType).toBe('String');
	});

	test('multiline template preserves newlines', () => {
		expectSuccess('`line1\nline2`', 'line1\nline2');
	});

	test('nested template inside a hole', () => {
		expectSuccess('x = "in"; `out ${`nested ${x}`} end`', 'out nested in end');
	});

	test('inferred type of a pure template is String', () => {
		const result = parseAndType('x = "a"; `b ${x}`');
		expect(
			typeToString(result.type!, result.state.substitution)
		).toBe('String');
	});

	test('effects performed in a hole propagate to the template', () => {
		const result = parseAndType('`said: ${(print "hi"; 42)}`');
		const typeStr = typeToString(result.type!, result.state.substitution);
		expect(typeStr).toContain('String');
		expect(Array.from(result.effects ?? [])).toContain('write');
	});

	test('a hole whose type has no Show impl is a type error', () => {
		expectError(
			'variant Secret = Hidden; `${Hidden}`',
			/no implementation of trait function 'show' for Secret/i
		);
	});

	test('a hole that performs an effect but yields Unit is a type error, not a silent {}', () => {
		expectError(
			'`said: ${print "hi"}`',
			/no implementation of trait function 'show' for unit/i
		);
	});

	test("the Show error points at the hole's expression, not synthesized nodes", () => {
		// `Hidden` in the hole starts at column 29
		expectError(
			'variant Secret = Hidden; `${Hidden}`',
			/line 1, column 29/
		);
	});
});
