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

const typeChecks = (code: string) => typeAndDecorate(parse(new Lexer(code).tokenize()));

// --- Effect inference: a function's body effects are latent on its type ---

test('Effect inference - fn x => print x carries !write on its type', () => {
	expect(typeStr('fn x => print x')).toBe('a -> a !write');
});

test('Effect inference - a pure function has no effect', () => {
	expect(typeStr('fn x => x')).toBe('a -> a');
});

test('Effect inference - readFile body surfaces !read', () => {
	expect(typeStr('fn p => readFile p')).toBe('String -> String !read');
});

test('Effect inference - effects propagate through a wrapping call', () => {
	expect(typeStr('g = fn x => print x; fn y => g y')).toBe('a -> a !write');
});

// --- Effect enforcement: annotations may over-declare but not omit effects ---

test('Effect enforcement - annotation omitting a performed effect is rejected', () => {
	expect(() => typeChecks('fn x => print x : a -> a')).toThrow(
		/omits effect .*write/
	);
});

test('Effect enforcement - annotation omitting one of several effects is rejected', () => {
	expect(() =>
		typeChecks('fn n => (log "x"; print n) : Float -> Float !write')
	).toThrow(/omits effect .*log/);
});

test('Effect enforcement - a matching effect annotation is accepted', () => {
	expect(typeStr('fn x => print x : a -> a !write')).toBe('a -> a !write');
});

test('Effect enforcement - over-declaring effects (conservative) is allowed', () => {
	expect(typeStr('fn x => x : a -> a !write')).toBe('a -> a !write');
});
