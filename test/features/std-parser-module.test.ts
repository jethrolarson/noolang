// std/parser — generic parser-combinator library, built as a forcing
// function one level down from std/json.noo (which is rewritten on top of
// it — see test/features/std-json-module.test.ts). Tested the same way
// std/json is: import the module and exercise it as a real consumer would.
import { test, expect, setDefaultTimeout } from 'bun:test';
import { expectSuccess, runCode } from '../utils';

// First test in this file pays the one-time module-typecheck cost; see the
// identical note in std-json-module.test.ts.
setDefaultTimeout(30000);

const importParser = `{@char char, @satisfy satisfy, @string_lit string_lit, @is_digit is_digit, @is_whitespace is_whitespace, @is_alpha is_alpha, @is_alnum is_alnum, @take_while take_while, @take_while1 take_while1, @skip_ws skip_ws, @lexeme lexeme, @pmap pmap, @pbind pbind, @succeed succeed, @fail fail, @choice2 choice2, @choice choice, @optional optional, @many many, @many1 many1, @sep_by sep_by, @sep_by1 sep_by1, @between between, @ParseError ParseError} = import "std/parser";`;

// Renders a `Result {@value a, @pos Float} ParseError` down to a plain
// string so assertions don't need to know the constructor shapes. `show_v`
// converts the success value to a string (e.g. `toString` or a bespoke
// stringifier for lists).
const outcome = (parserExpr: string, input: string, showV: string) => `
${importParser}
match (${parserExpr} 0 ${input}) (
  Ok r => concat "OK:" ((${showV}) (r | @value));
  Err e => match e (ParseError info => concat "ERR:" (@message info))
)`;

test('char matches an exact character and reports position on failure', () => {
	expectSuccess(outcome('char "a"', '"abc"', 'fn s => s'), 'OK:a');
	expectSuccess(
		outcome('char "a"', '"xyz"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('satisfy matches by predicate', () => {
	expectSuccess(
		outcome('satisfy "digit" is_digit', '"9x"', 'fn s => s'),
		'OK:9'
	);
	expectSuccess(
		outcome('satisfy "digit" is_digit', '"x9"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('string_lit matches a literal keyword and fails on a mismatch', () => {
	expectSuccess(outcome('string_lit "true"', '"true!"', 'fn s => s'), 'OK:true');
	expectSuccess(
		outcome('string_lit "true"', '"false"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('is_digit / is_whitespace / is_alpha / is_alnum classify characters', () => {
	expectSuccess(
		`${importParser} {is_digit "5", is_digit "x", is_whitespace " ", is_whitespace "x", is_alpha "q", is_alpha "5", is_alnum "5", is_alnum "!"}`,
		[true, false, true, false, true, false, true, false]
	);
});

test('take_while scans a run of matching characters, possibly empty', () => {
	expectSuccess(
		`${importParser} (take_while is_digit 0 "123abc") | @value`,
		'123'
	);
	expectSuccess(
		`${importParser} (take_while is_digit 0 "abc") | @value`,
		''
	);
	expectSuccess(
		`${importParser} (take_while is_digit 0 "123abc") | @pos`,
		3
	);
});

test('take_while1 requires at least one match', () => {
	expectSuccess(
		outcome('take_while1 "digit" is_digit', '"123abc"', 'fn s => s'),
		'OK:123'
	);
	expectSuccess(
		outcome('take_while1 "digit" is_digit', '"abc"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('skip_ws advances past leading whitespace only', () => {
	expectSuccess(`${importParser} skip_ws 0 "   x"`, 3);
	expectSuccess(`${importParser} skip_ws 0 "x"`, 0);
});

test('lexeme skips leading whitespace before running a parser', () => {
	expectSuccess(
		outcome('lexeme (char "x")', '"   x!"', 'fn s => s'),
		'OK:x'
	);
});

test('pmap transforms a successful value, leaves errors alone', () => {
	expectSuccess(
		outcome('pmap (fn s => concat s s) (char "a")', '"ab"', 'fn s => s'),
		'OK:aa'
	);
	expectSuccess(
		outcome('pmap (fn s => concat s s) (char "a")', '"xy"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('pbind sequences two parsers, threading the position through', () => {
	expectSuccess(
		outcome(
			'pbind (fn a => pmap (fn b => concat a b) (char "b")) (char "a")',
			'"abc"',
			'fn s => s'
		),
		'OK:ab'
	);
	expectSuccess(
		outcome(
			'pbind (fn a => pmap (fn b => concat a b) (char "b")) (char "a")',
			'"acc"',
			'fn s => s'
		),
		expect.stringContaining('ERR:')
	);
});

test('succeed always succeeds without consuming input; fail always fails', () => {
	expectSuccess(outcome('succeed "z"', '"abc"', 'fn s => s'), 'OK:z');
	expectSuccess(
		`${importParser} match ((succeed "z") 5 "abc") (Ok r => (r | @pos); Err _ => 0 - 1)`,
		5
	);
	expectSuccess(
		outcome('fail "nope"', '"abc"', 'fn s => s'),
		expect.stringContaining('ERR:nope')
	);
});

test('choice2 / choice try alternatives in order and backtrack on failure', () => {
	expectSuccess(
		outcome('choice2 (char "a") (char "b")', '"bcd"', 'fn s => s'),
		'OK:b'
	);
	expectSuccess(
		outcome('choice [char "a", char "b", char "c"]', '"c!"', 'fn s => s'),
		'OK:c'
	);
	expectSuccess(
		outcome('choice [char "a", char "b"]', '"z"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('optional yields Some on success, None on failure, and never fails itself', () => {
	expectSuccess(
		outcome('optional (char "a")', '"abc"', 'fn ov => match ov (Some v => v; None => "none")'),
		'OK:a'
	);
	expectSuccess(
		outcome('optional (char "a")', '"xyz"', 'fn ov => match ov (Some v => v; None => "none")'),
		'OK:none'
	);
	expectSuccess(
		`${importParser} match ((optional (char "a")) 0 "xyz") (Ok r => (r | @pos); Err _ => 0 - 1)`,
		0
	);
});

test('many collects zero or more matches without failing', () => {
	expectSuccess(
		outcome('many (char "a")', '"aaab"', 'fn xs => join "" xs'),
		'OK:aaa'
	);
	expectSuccess(
		outcome('many (char "a")', '"bbb"', 'fn xs => join "" xs'),
		'OK:'
	);
});

test('many1 requires at least one match', () => {
	expectSuccess(
		outcome('many1 (char "a")', '"aab"', 'fn xs => join "" xs'),
		'OK:aa'
	);
	expectSuccess(
		outcome('many1 (char "a")', '"bbb"', 'fn xs => join "" xs'),
		expect.stringContaining('ERR:')
	);
});

test('sep_by collects zero or more elements separated by a delimiter', () => {
	expectSuccess(
		outcome('sep_by (char "x") (char ",")', '"x,x,x!"', 'fn xs => join "" xs'),
		'OK:xxx'
	);
	expectSuccess(
		outcome('sep_by (char "x") (char ",")', '"!"', 'fn xs => join "" xs'),
		'OK:'
	);
	// Trailing separator with nothing after it is a hard error, not a stop.
	expectSuccess(
		outcome('sep_by (char "x") (char ",")', '"x,!"', 'fn xs => join "" xs'),
		expect.stringContaining('ERR:')
	);
});

test('sep_by1 requires at least one element', () => {
	expectSuccess(
		outcome('sep_by1 (char "x") (char ",")', '"x,x!"', 'fn xs => join "" xs'),
		'OK:xx'
	);
	expectSuccess(
		outcome('sep_by1 (char "x") (char ",")', '"!"', 'fn xs => join "" xs'),
		expect.stringContaining('ERR:')
	);
});

test('between parses a value surrounded by open/close delimiters', () => {
	expectSuccess(
		outcome('between (char "(") (char ")") (char "x")', '"(x)tail"', 'fn s => s'),
		'OK:x'
	);
	expectSuccess(
		outcome('between (char "(") (char ")") (char "x")', '"(x!"', 'fn s => s'),
		expect.stringContaining('ERR:')
	);
});

test('choice / many compose to parse a small realistic grammar (unsigned int)', () => {
	expectSuccess(
		outcome(
			'pmap (fn s => length (chars s)) (take_while1 "digit" is_digit)',
			'"42abc"',
			'toString'
		),
		'OK:2'
	);
});

test('a long run of matching characters does not overflow the stack (take_while)', () => {
	const longDigits = '9'.repeat(6000);
	expectSuccess(
		outcome('take_while1 "digit" is_digit', `"${longDigits}"`, 'fn s => toString (length (chars s))'),
		'OK:6000'
	);
});

test('the module export types are visible to the importer', () => {
	const { finalType } = runCode(`{@char} = import "std/parser"; char`);
	expect(finalType).toContain('ParseError');
});
