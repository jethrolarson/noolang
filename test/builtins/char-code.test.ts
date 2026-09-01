import { describe, test } from 'bun:test';
import { expectSuccess, expectError } from '../utils';

describe('char_code / from_char_code builtins', () => {
	test('char_code of an ASCII char returns its codepoint', () => {
		expectSuccess(`char_code "A"`, 65);
	});

	test('from_char_code of an ASCII codepoint returns the char', () => {
		expectSuccess(`from_char_code 65`, 'A');
	});

	test('round-trips a non-ASCII BMP char (é)', () => {
		expectSuccess(`from_char_code (char_code "é")`, 'é');
	});

	test('round-trips a non-ASCII BMP char (€)', () => {
		expectSuccess(`from_char_code (char_code "€")`, '€');
	});

	test('char_code only reads the first character of a multi-char string', () => {
		expectSuccess(`char_code "AB"`, 65);
	});

	test('char_code on empty string throws', () => {
		expectError(`char_code ""`, /char_code requires a non-empty string/);
	});

	test('char_code on a non-string throws a type error', () => {
		expectError(`char_code 5`, /Expected:\s*String/);
	});

	test('from_char_code on a non-numeric codepoint throws', () => {
		expectError(`from_char_code (0 - 1)`, /from_char_code/);
	});

	test('from_char_code on a non-number throws a type error', () => {
		expectError(`from_char_code "A"`, /Expected:\s*Float/);
	});
});
