// std/json — hand-written recursive-descent JSON parser/serializer, built
// as plain userland noolang (no native JSON.parse wrapper; see
// docs/internal/docs-wip/JSON_PARSER_PLAN.md). Tested the same way
// std/test is: import the module and exercise it as a real consumer would.
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

const importJson = `{@json_parse json_parse, @json_stringify json_stringify, @json_field json_field, @json_index json_index, @json_as_string json_as_string, @json_as_number json_as_number, @json_as_bool json_as_bool, @json_as_array json_as_array, @json_as_object json_as_object} = import "std/json";`;

// Renders a Result JsonValue JsonParseError down to a plain string so
// assertions don't need to know the constructor shapes.
const parseOutcome = (jsonText: string) => `
${importJson}
match (json_parse ${jsonText}) (
  Ok v => concat "OK:" (json_stringify v);
  Err e => match e (JsonParseError info => concat "ERR:" (@message info))
)`;

// Parses `jsonText` (assumed valid) and feeds the JsonValue into `expr`,
// which should reference `v`. Avoids `Ok v = ...` — noolang has no
// irrefutable constructor-pattern binding outside `match`.
const withParsed = (jsonText: string, expr: string) => `
${importJson}
match (json_parse ${jsonText}) (
  Ok v => (${expr});
  Err _ => "parse-failed"
)`;

test('parses primitives', () => {
	expectSuccess(parseOutcome('"null"'), 'OK:null');
	expectSuccess(parseOutcome('"true"'), 'OK:true');
	expectSuccess(parseOutcome('"false"'), 'OK:false');
	expectSuccess(parseOutcome('"\\"hello\\""'), 'OK:"hello"');
});

test('parses numbers: integers, negatives, decimals, exponents', () => {
	expectSuccess(parseOutcome('"0"'), 'OK:0');
	expectSuccess(parseOutcome('"42"'), 'OK:42');
	expectSuccess(parseOutcome('"-42"'), 'OK:-42');
	expectSuccess(parseOutcome('"3.14"'), 'OK:3.14');
	expectSuccess(parseOutcome('"-3.14"'), 'OK:-3.14');
	expectSuccess(parseOutcome('"1e2"'), 'OK:100');
	expectSuccess(parseOutcome('"1.5e2"'), 'OK:150');
	expectSuccess(parseOutcome('"1E+2"'), 'OK:100');
	expectSuccess(parseOutcome('"2.5e-1"'), 'OK:0.25');
});

test('parses arrays, including nested and empty', () => {
	expectSuccess(parseOutcome('"[1,2,3]"'), 'OK:[1,2,3]');
	expectSuccess(parseOutcome('"[]"'), 'OK:[]');
	expectSuccess(parseOutcome('"[[1,2],[3,4]]"'), 'OK:[[1,2],[3,4]]');
	expectSuccess(parseOutcome('"[1, true, null, \\"x\\"]"'), 'OK:[1,true,null,"x"]');
});

test('parses objects, including nested and empty', () => {
	expectSuccess(parseOutcome('"{\\"a\\":1,\\"b\\":2}"'), 'OK:{"a":1,"b":2}');
	expectSuccess(parseOutcome('"{}"'), 'OK:{}');
	expectSuccess(
		parseOutcome('"{\\"a\\":{\\"b\\":[1,2]}}"'),
		'OK:{"a":{"b":[1,2]}}'
	);
});

test('tolerates whitespace around tokens', () => {
	expectSuccess(
		parseOutcome('"  { \\"a\\" : 1 , \\"b\\" : [ 1 , 2 ] }  "'),
		'OK:{"a":1,"b":[1,2]}'
	);
});

test('handles string escapes: quote, backslash, slash, newline, tab, cr', () => {
	expectSuccess(parseOutcome('"\\"a\\\\\\"b\\""'), 'OK:"a\\"b"');
	expectSuccess(parseOutcome('"\\"a\\\\\\\\b\\""'), 'OK:"a\\\\b"');
	expectSuccess(parseOutcome('"\\"a\\\\/b\\""'), 'OK:"a/b"');
	expectSuccess(parseOutcome('"\\"a\\\\nb\\""'), 'OK:"a\\nb"');
	expectSuccess(parseOutcome('"\\"a\\\\tb\\""'), 'OK:"a\\tb"');
});

test('rejects malformed input with a positioned error', () => {
	expectSuccess(parseOutcome('"not json"'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"{\\"a\\": }"'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"[1, 2,]"'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"\\"unterminated"'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('""'), expect.stringContaining('ERR:'));
});

test('rejects trailing content after a valid value', () => {
	expectSuccess(parseOutcome('"{\\"a\\":1} extra"'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"1 2"'), expect.stringContaining('ERR:'));
});

test('decodes \\uXXXX escapes, including surrogate pairs, and rejects lone surrogates', () => {
	expectSuccess(parseOutcome('"\\"\\\\u0041\\""'), 'OK:"A"');
	expectSuccess(parseOutcome('"\\"\\\\u00e9\\""'), 'OK:"é"');
	expectSuccess(parseOutcome('"\\"\\\\ud83d\\\\ude00\\""'), 'OK:"😀"');
	expectSuccess(parseOutcome('"\\"\\\\ud83d\\""'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"\\"\\\\udc00\\""'), expect.stringContaining('ERR:'));
});

test('rejects unsupported \\b/\\f escapes rather than mis-decoding them', () => {
	// Documented scope limit: noolang's own string-literal lexer has no way
	// to write these two control characters.
	expectSuccess(parseOutcome('"\\"\\\\b\\""'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"\\"\\\\f\\""'), expect.stringContaining('ERR:'));
});

test('json_stringify round-trips through json_parse', () => {
	expectSuccess(
		withParsed(
			'"{\\"name\\":\\"Ada\\",\\"tags\\":[\\"math\\",\\"cs\\"],\\"active\\":true,\\"meta\\":null,\\"score\\":3.5}"',
			`
    stringified = json_stringify v;
    match (json_parse stringified) (
      Ok v2 => if v == v2 then "roundtrip-ok" else "roundtrip-mismatch";
      Err _ => "reparse-failed"
    )`
		),
		'roundtrip-ok'
	);
});

test('Eq JsonValue (==) distinguishes different values and ignores nothing', () => {
	expectSuccess(
		`
${importJson}
a = json_parse "{\\"x\\":1,\\"y\\":[1,2]}";
b = json_parse "{\\"x\\":1,\\"y\\":[1,2]}";
c = json_parse "{\\"x\\":1,\\"y\\":[1,3]}";
match {a, b, c} (
  {Ok va, Ok vb, Ok vc} =>
    if (va == vb) && (not (va == vc))
      then "as-expected"
      else "mismatch";
  _ => "parse-failed"
)`,
		'as-expected'
	);
});

test('json_field extracts an object member, errors on missing key or non-object', () => {
	expectSuccess(
		withParsed(
			'"{\\"a\\":1}"',
			'match (json_field "a" v) (Ok found => json_stringify found; Err _ => "missing")'
		),
		'1'
	);
	expectSuccess(
		withParsed(
			'"{\\"a\\":1}"',
			'match (json_field "z" v) (Ok _ => "found"; Err _ => "missing")'
		),
		'missing'
	);
	expectSuccess(
		withParsed(
			'"[1,2]"',
			'match (json_field "a" v) (Ok _ => "found"; Err _ => "not-object")'
		),
		'not-object'
	);
});

test('json_index extracts an array element, errors on out-of-bounds or non-array', () => {
	expectSuccess(
		withParsed(
			'"[10,20,30]"',
			'match (json_index 1 v) (Ok found => json_stringify found; Err _ => "missing")'
		),
		'20'
	);
	expectSuccess(
		withParsed(
			'"[10,20,30]"',
			'match (json_index 9 v) (Ok _ => "found"; Err _ => "missing")'
		),
		'missing'
	);
});

test('json_as_* extractors accept the matching shape and reject others', () => {
	expectSuccess(
		withParsed('"\\"hi\\""', 'match (json_as_string v) (Ok s => s; Err _ => "wrong-type")'),
		'hi'
	);
	expectSuccess(
		withParsed('"42"', 'match (json_as_string v) (Ok _ => "string"; Err _ => "wrong-type")'),
		'wrong-type'
	);
	expectSuccess(
		withParsed(
			'"true"',
			'match (json_as_bool v) (Ok b => if b then "yes" else "no"; Err _ => "wrong-type")'
		),
		'yes'
	);
});

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

test('duplicate object keys: last value wins, first position kept', () => {
	expectSuccess(parseOutcome('"{\\"a\\":1,\\"b\\":2,\\"a\\":3}"'), 'OK:{"a":3,"b":2}');
});

test('rejects a leading zero in the integer part', () => {
	expectSuccess(parseOutcome('"01"'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"-01"'), expect.stringContaining('ERR:'));
	// "0" alone and "0.5" are still valid — the check is "0 followed by
	// another digit", not "any leading 0".
	expectSuccess(parseOutcome('"0"'), 'OK:0');
	expectSuccess(parseOutcome('"0.5"'), 'OK:0.5');
});

test('rejects a raw unescaped control character in a string', () => {
	// A literal tab byte between the quotes, not the two-character escape
	// `\t`. RFC 8259 §7 requires this to be escaped.
	expectSuccess(parseOutcome('"\\"a\tb\\""'), expect.stringContaining('ERR:'));
});

test('json_stringify emits "null" for non-finite numbers instead of invalid syntax', () => {
	// json_parse "1e400" overflows our own arithmetic to Infinity — this
	// isn't a hand-constructed pathological JsonValue, it's reachable from
	// valid-looking JSON text.
	expectSuccess(
		withParsed('"1e400"', 'json_stringify v'),
		'null'
	);
	expectSuccess(
		withParsed('"-1e400"', 'json_stringify v'),
		'null'
	);
});
