// std/json is an ordinary unprivileged userland noolang module (not part
// of stdlib.noo, which every program gets for free) — its behavior is
// exercised in json.test.noo (run via `noo test`), the way an idiomatic
// noolang library gets tested by its own users. This file holds only what
// json.test.noo cannot express: inferred-type assertions (Expectation in
// std/test only wraps runtime Pass/Fail), and a stack-depth stress test
// that needs a trivially-built huge string (no `repeat`/`replicate` in
// stdlib.noo, and building one via recursion in .noo would risk hitting a
// different stack limit than the one under test).
import { test, expect, setDefaultTimeout } from 'bun:test';
import { expectSuccess, runCode } from '../utils';

// Whichever test in this file runs first pays a real, one-time cost:
// typechecking std/json.noo from scratch currently takes ~15s (module
// results are cached per-process after that — see the module-loader cache
// in src/module-loader.ts — so every other test in this file, and every
// other file that imports std/json in the same `bun test` run, is fast).
// Bun's default per-test timeout is 5000ms, well under that, so without
// this the first test intermittently fails as a timeout rather than a
// real assertion failure. The ~15s figure itself is a known, tracked
// problem (see the PR #165 discussion and the comment on parse_node in
// std/json.noo) — this raises the ceiling to stop CI flaking on it, not to
// paper over it.
setDefaultTimeout(30000);

const importJson = `{@json_parse json_parse, @json_field json_field, @json_as_string json_as_string} = import "std/json";`;

// Parses `jsonText` (assumed valid) and feeds the JsonValue into `expr`,
// which should reference `v`. Avoids `Ok v = ...` — noolang has no
// irrefutable constructor-pattern binding outside `match`.
const withParsed = (jsonText: string, expr: string) => `
${importJson}
match (json_parse ${jsonText}) (
  Ok v => (${expr});
  Err _ => "parse-failed"
)`;

test('the module export types are visible to the importer', () => {
	const { finalType } = runCode(`{@json_parse} = import "std/json"; json_parse`);
	expect(finalType).toContain('JsonValue');
});

// Regression: scan_string used to recurse once per input character with a
// growing accumulator, which overflowed the JS call stack around ~4000
// chars regardless of accumulator style (no TCO in the evaluator — see
// std/json.noo's comment on scan_content). A 6000-char string value used
// to crash outright; this asserts it now round-trips.
test('a long string value does not overflow the stack', () => {
	const longValue = 'x'.repeat(6000);
	const jsonText = JSON.stringify({ text: longValue });
	expectSuccess(
		withParsed(
			JSON.stringify(jsonText),
			'match (json_field "text" v) (Ok tv => match (json_as_string tv) (Ok s => toString (length (chars s)); Err _ => "wrong-type"); Err _ => "missing")'
		),
		'6000'
	);
});

test('a long string with interspersed escapes does not overflow the stack', () => {
	let raw = '';
	for (let i = 0; i < 5000; i++) raw += i % 37 === 0 ? '\n' : 'x';
	const jsonText = JSON.stringify({ text: raw });
	expectSuccess(
		withParsed(
			JSON.stringify(jsonText),
			'match (json_field "text" v) (Ok tv => match (json_as_string tv) (Ok s => toString (length (chars s)); Err _ => "wrong-type"); Err _ => "missing")'
		),
		'5000'
	);
});
