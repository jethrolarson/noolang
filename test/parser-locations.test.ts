import { test, expect, describe } from 'bun:test';
import { Lexer } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import type { Expression } from '../src/ast';

// Every composite expression's location must span from its own start to the
// end of its rightmost consumed token — not just its left operand's end.
// Several parser sites built these nodes as `location: left.location`,
// silently truncating the range to the left operand and corrupting any tool
// that splices source text at a node's reported end (e.g. an LSP code
// action inserting/replacing a type annotation).

function parseExpr(src: string): Expression {
	const program = parse(new Lexer(src).tokenize());
	return program.statements[0];
}

// column is 1-based and exclusive at the end, matching the lexer/parser convention
function endCol(expr: Expression): number {
	return expr.location.end.column;
}

describe('composite expression locations span through the right operand', () => {
	test('additive (+)', () => {
		expect(endCol(parseExpr('1 + 22'))).toBe(7);
	});

	test('additive (-)', () => {
		expect(endCol(parseExpr('1 - 22'))).toBe(7);
	});

	test('multiplicative (*)', () => {
		expect(endCol(parseExpr('1 * 22'))).toBe(7);
	});

	test('multiplicative (/)', () => {
		expect(endCol(parseExpr('1 / 22'))).toBe(7);
	});

	test('multiplicative (%)', () => {
		expect(endCol(parseExpr('1 % 22'))).toBe(7);
	});

	test('comparison (<)', () => {
		expect(endCol(parseExpr('1 < 22'))).toBe(7);
	});

	test('equality (==)', () => {
		expect(endCol(parseExpr('1 == 22'))).toBe(8);
	});

	test('logical and (&&)', () => {
		expect(endCol(parseExpr('True && False'))).toBe(14);
	});

	test('logical or (||)', () => {
		expect(endCol(parseExpr('True || False'))).toBe(14);
	});

	test('thrush (|)', () => {
		expect(endCol(parseExpr('1 | toString'))).toBe(13);
	});

	test('pipeline (|>)', () => {
		expect(endCol(parseExpr('1 |> toString'))).toBe(14);
	});

	test('dollar ($)', () => {
		expect(endCol(parseExpr('toString $ 123456'))).toBe(18);
	});

	test('function application chain', () => {
		expect(endCol(parseExpr('f 1 2345'))).toBe(9);
	});

	test('sequence (;)', () => {
		expect(endCol(parseExpr('1; 2345'))).toBe(8);
	});

	test('lambda body additive', () => {
		const fn = parseExpr('fn x => x + 22222');
		expect(endCol(fn)).toBe(18);
	});

	test('lambda body comparison', () => {
		const fn = parseExpr('fn x => x < 22222');
		expect(endCol(fn)).toBe(18);
	});

	test('lambda body logical and', () => {
		const fn = parseExpr('fn x => x && False');
		expect(endCol(fn)).toBe(19);
	});

	test('lambda body thrush', () => {
		const fn = parseExpr('fn x => x | toString');
		expect(endCol(fn)).toBe(21);
	});

	test('lambda body application chain', () => {
		const fn = parseExpr('fn f => f 1 2345');
		expect(endCol(fn)).toBe(17);
	});

	test('typed expression spans through the annotation', () => {
		const typed = parseExpr('(fn x => x + 1) : Float -> Float');
		expect(endCol(typed)).toBe(33);
	});

	test('definition-level type annotation spans through the annotation', () => {
		const def = parseExpr('add_one = fn x => x + 1 : Float -> Float');
		expect(def.kind).toBe('definition');
		if (def.kind === 'definition') {
			expect(endCol(def.value)).toBe(41);
		}
	});

	test('lambda expression spans through its body', () => {
		const fn = parseExpr('fn x => x + 22222');
		expect(fn.kind).toBe('function');
		expect(endCol(fn)).toBe(18);
	});

	// Found via real corruption: the LSP "infer type annotation" action
	// spliced text at an `if` expression's reported end, which pointed at
	// just the `if` keyword — inserting the annotation mid-condition instead
	// of after the whole if/then/else. Same bug class as the binary/pipeline
	// sites above, different node kinds that weren't covered by that sweep.
	test('if/then/else spans through the else branch', () => {
		expect(endCol(parseExpr('if True then 1 else 22222'))).toBe(26);
	});

	test('unary minus spans through the operand', () => {
		expect(endCol(parseExpr('-22222'))).toBe(7);
	});

	test('unary minus in a lambda body spans through the operand', () => {
		expect(endCol(parseExpr('fn x => -22222'))).toBe(15);
	});

	test('record literal spans through the closing brace', () => {
		expect(endCol(parseExpr('{@a 22222}'))).toBe(11);
	});

	test('tuple literal spans through the closing brace', () => {
		expect(endCol(parseExpr('{1, 22222}'))).toBe(11);
	});

	test('unit literal spans through the closing brace', () => {
		expect(endCol(parseExpr('{}'))).toBe(3);
	});

	test('list literal spans through the closing bracket', () => {
		expect(endCol(parseExpr('[1, 22222]'))).toBe(11);
	});

	test('where expression spans through its definitions clause', () => {
		expect(endCol(parseExpr('main where (x = 22222)'))).toBe(23);
	});
});
