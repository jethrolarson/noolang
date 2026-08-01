// std/json — hand-written recursive-descent JSON parser/serializer, built
// as plain userland noolang (no native JSON.parse wrapper; see
// docs/internal/docs-wip/JSON_PARSER_PLAN.md). Tested the same way
// std/test is: import the module and exercise it as a real consumer would.
import { test, expect } from 'bun:test';
import { expectSuccess, runCode } from '../utils';

const importJson = `{@json_parse json_parse, @json_stringify json_stringify, @json_equals json_equals, @json_field json_field, @json_index json_index, @json_as_string json_as_string, @json_as_number json_as_number, @json_as_bool json_as_bool, @json_as_array json_as_array, @json_as_object json_as_object} = import "std/json";`;

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

test('rejects unsupported \\u and \\b/\\f escapes rather than mis-decoding them', () => {
	// Documented scope limit: no codepoint<->char builtin (fromCharCode /
	// charCodeAt) exists in noolang, so \u escapes can't be decoded and
	// aren't silently passed through either.
	expectSuccess(parseOutcome('"\\"\\\\u0041\\""'), expect.stringContaining('ERR:'));
	expectSuccess(parseOutcome('"\\"\\\\b\\""'), expect.stringContaining('ERR:'));
});

test('json_stringify round-trips through json_parse', () => {
	expectSuccess(
		withParsed(
			'"{\\"name\\":\\"Ada\\",\\"tags\\":[\\"math\\",\\"cs\\"],\\"active\\":true,\\"meta\\":null,\\"score\\":3.5}"',
			`
    stringified = json_stringify v;
    match (json_parse stringified) (
      Ok v2 => if json_equals v v2 then "roundtrip-ok" else "roundtrip-mismatch";
      Err _ => "reparse-failed"
    )`
		),
		'roundtrip-ok'
	);
});

test('json_equals distinguishes different values and ignores nothing', () => {
	expectSuccess(
		`
${importJson}
a = json_parse "{\\"x\\":1,\\"y\\":[1,2]}";
b = json_parse "{\\"x\\":1,\\"y\\":[1,2]}";
c = json_parse "{\\"x\\":1,\\"y\\":[1,3]}";
match {a, b, c} (
  {Ok va, Ok vb, Ok vc} =>
    if (json_equals va vb) && (not (json_equals va vc))
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
