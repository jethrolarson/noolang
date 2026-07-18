// {} is unit, the empty record, and the empty tuple simultaneously — one type,
// by design (decided 2026-07-17). The three spellings must unify, the value {}
// infers as that type (not a fresh variable), and the printer's `{}` names a
// type the annotation parser accepts.
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../index';
import { typeToString } from '../helpers';
import { test, expect } from 'bun:test';
import { parseAndType } from '../../../test/utils';

const typeStr = (code: string) => {
	const r = parseAndType(code);
	return typeToString(r.type, r.state.substitution);
};

const typeChecks = (code: string) =>
	typeAndDecorate(parse(new Lexer(code).tokenize()));

test('the value {} infers as unit, not a bare type variable', () => {
	expect(typeStr('{}')).toBe('{}');
});

test('annotation {} unifies with a unit-returning builtin', () => {
	expect(typeStr('(fn s => log s) : String -> {} !log')).toBe(
		'String -> {} !log'
	);
});

test('annotation Unit and annotation {} name the same type', () => {
	expect(typeStr('(fn s => log s) : String -> Unit !log')).toBe(
		'String -> {} !log'
	);
	expect(typeStr('({}) : Unit')).toBe('{}');
	expect(typeStr('({}) : {}')).toBe('{}');
});

test('a function returning literal {} accepts a Unit return annotation', () => {
	expect(typeStr('(fn _ => {}) : Unit -> Unit')).toBe('{} -> {}');
});

test('non-empty records are unaffected', () => {
	expect(typeStr('{@a 1}')).toBe('{ @a Float }');
	expect(() => typeChecks('({@a 1}) : Unit')).toThrow();
});
