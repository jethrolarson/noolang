import { expect, test } from 'bun:test';
import {
	assertListType,
	assertPrimitiveType,
	expectError,
	parseAndType,
	runCode,
} from '../utils';

const containerPrelude = `
	constraint Container container (
		empty : container a;
		insert : a -> container a -> container a
	);

	implement Container (typefn a => List a) (
		empty = [];
		insert = fn x list => cons x list
	);
`;

test('traits can declare and evaluate associated values selected by type', () => {
	const result = runCode(`${containerPrelude} empty : List Float`);

	assertListType(result.typeResult.type);
	assertPrimitiveType(result.typeResult.type.element);
	expect(result.typeResult.type.element.name).toBe('Float');
	expect(result.finalValue).toEqual([]);
});

test('a value-only higher-kinded trait determines constructor arity', () => {
	const result = parseAndType(`
		constraint Empty container (empty : container a);
		implement Empty (typefn a => List a) (empty = []);
		empty : List String
	`);

	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toBe('String');
});

test('associated value selection is nominal and annotation-directed', () => {
	const float = runCode(`
		constraint Default value (default : value);
		implement Default Float (default = 0);
		implement Default String (default = "");
		default : Float
	`);
	const string = runCode(`
		constraint Default value (default : value);
		implement Default String (default = "");
		implement Default Float (default = 0);
		default : String
	`);

	expect(float.finalType).toBe('Float');
	expect(float.finalValue).toBe(0);
	expect(string.finalType).toBe('String');
	expect(string.finalValue).toBe('');
});

test('bare associated values remain ambiguous even with one implementation', () => {
	expectError(
		`${containerPrelude} empty`,
		/associated value.*expected type|ambiguous/i
	);
});

test('implementations must provide all and only declared associated values', () => {
	expectError(
		`constraint Default value (default : value); implement Default Float ()`,
		/Missing implementation for 'default'/
	);
	expectError(
		`constraint Default value (default : value); implement Default Float (other = 0)`,
		/member 'other'.*not required/i
	);
});

test('associated values are checked rigidly for every constructor argument', () => {
	expectError(
		`constraint Empty container (empty : container a);
		 implement Empty (typefn a => List a) (empty = [0])`,
		/incompatible with the rigid 'Empty' signature/
	);
});

test('duplicate implementations remain constructor-wide', () => {
	expectError(
		`constraint Empty container (empty : container a);
		 implement Empty (typefn a => List a) (empty = []);
		 implement Empty (typefn a => List a) (empty = [])`,
		/Duplicate implementation of Empty for List/
	);
});

test('a shared associated value name reports trait ambiguity', () => {
	expectError(
		`constraint First value (default : value);
		 constraint Second value (default : value);
		 implement First Float (default = 1);
		 implement Second Float (default = 2);
		 default : Float`,
		/Ambiguous associated value 'default'.*First, Second/
	);
});

test('associated values capture the implementation-definition environment', () => {
	const result = runCode(`
		helper = 41;
		constraint Default value (default : value);
		implement Default Float (default = helper + 1);
		get = fn helper => (default : Float);
		get 0
	`);

	expect(result.finalValue).toBe(42);
});

test('associated value initialization cannot perform undeclared effects', () => {
	expectError(
		`constraint Default value (default : value);
		 implement Default Float (default = (print "surprise"; 1))`,
		/associated value 'default'.*performs effects/i
	);
});
