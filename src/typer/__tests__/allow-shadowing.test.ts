import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../decoration';
import { createTypeState } from '../type-operations';
import { test, expect } from 'bun:test';

// Literate `.md` files' `shadow: true` frontmatter needs to let the same
// variant/type name be declared more than once across independent
// illustrative sections of one file (README.md redeclares
// `variant Color = Red | Green | Blue;` three times). Without the flag this
// throws today (confirmed live: `bun src/cli.ts README.md` fails with
// `TypeError: Type shadowing is not allowed: Color`).

const decorate = (code: string, allowShadowing: boolean) => {
	const program = parse(new Lexer(code).tokenize());
	const initialState = allowShadowing
		? { ...createTypeState(), allowShadowing: true }
		: createTypeState();
	return typeAndDecorate(program, initialState);
};

test('allowShadowing - redefining a variant name at top level throws without the flag', () => {
	const code = 'variant Color = Red | Green | Blue; variant Color = Cyan | Magenta;';
	expect(() => decorate(code, false)).toThrow();
});

test('allowShadowing - redefining a variant name does not throw with the flag', () => {
	const code = 'variant Color = Red | Green | Blue; variant Color = Cyan | Magenta;';
	expect(() => decorate(code, true)).not.toThrow();
});

test('allowShadowing - redefining a type alias name does not throw with the flag', () => {
	const code = 'type Point = {Float, Float}; type Point = {Float, Float, Float};';
	expect(() => decorate(code, true)).not.toThrow();
});

test('allowShadowing - redefining an actually-reserved built-in type name still throws even with the flag', () => {
	const code = 'type Float = {Float};';
	expect(() => decorate(code, true)).toThrow('Shadowing built in type Float');
});
