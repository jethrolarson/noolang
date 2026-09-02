import { describe, test } from 'bun:test';
import { expectSuccess, expectError } from '../utils';

describe('char_code / from_char_code builtins', () => {
	test('char_code of an ASCII char returns Some its codepoint', () => {
		expectSuccess(`option_get_or 0 (char_code "A")`, 65);
	});

	test('from_char_code of an ASCII codepoint returns Some the char', () => {
		expectSuccess(`option_get_or "?" (from_char_code 65)`, 'A');
	});

	test('round-trips a non-ASCII BMP char (é)', () => {
		expectSuccess(
			`option_get_or "?" (bind (char_code "é") from_char_code)`,
			'é'
		);
	});

	test('round-trips a non-ASCII BMP char (€)', () => {
		expectSuccess(
			`option_get_or "?" (bind (char_code "€") from_char_code)`,
			'€'
		);
	});

	test('char_code only reads the first character of a multi-char string', () => {
		expectSuccess(`option_get_or 0 (char_code "AB")`, 65);
	});

	test('char_code on empty string is None', () => {
		expectSuccess(
			`match (char_code "") (None => True; Some _ => False)`,
			true
		);
	});

	test('char_code on a non-string throws a type error', () => {
		expectError(`char_code 5`, /Expected:\s*String/);
	});

	test('from_char_code on a negative codepoint is None', () => {
		expectSuccess(
			`match (from_char_code (0 - 1)) (None => True; Some _ => False)`,
			true
		);
	});

	test('from_char_code on a non-number throws a type error', () => {
		expectError(`from_char_code "A"`, /Expected:\s*Float/);
	});
});
