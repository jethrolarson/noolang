import { describe, expect, test } from 'bun:test';
import { expectError, expectSuccess, parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

const expectBool = (code: string) => {
	const result = parseAndType(code);
	expect(typeToString(result.type!, result.state.substitution)).toBe('Bool');
};

describe('structural Eq derivation', () => {
	test('tuples work through operators and direct equals', () => {
		expectBool('{1, "a"} == {1, "a"}');
		expectSuccess('{1, "a"} == {1, "a"}', true);
		expectSuccess('{1, "a"} == {2, "a"}', false);
		expectSuccess('{1, "a"} != {2, "a"}', true);
		expectSuccess('equals {1, "a"} {1, "a"}', true);
	});

	test('records ignore source field order and nested mixed shapes recurse', () => {
		expectSuccess('{@a 1, @b "x"} == {@b "x", @a 1}', true);
		expectSuccess(
			'variant V = A Float | B; {@item {A 1, "x"}} == {@item {A 1, "x"}}',
			true
		);
	});

	test('variants, generic variants, aliases, and recursive variants derive', () => {
		expectSuccess('variant V = A Float | B String; (A 1) == (A 1)', true);
		expectSuccess('variant V = A Float | B String; (A 1) == (B "x")', false);
		expectSuccess('variant Box a = Box a; (Box 1) == (Box 1)', true);
		expectSuccess(
			'type Pair = {Float, String}; ({1, "x"}: Pair) == ({1, "x"}: Pair)',
			true
		);
		expectSuccess(
			'variant Tree = Leaf Float | Branch {Tree, Tree}; (Branch {Leaf 1, Branch {Leaf 2, Leaf 3}}) == (Branch {Leaf 1, Branch {Leaf 2, Leaf 3}})',
			true
		);
	});

	test('an explicit implementation suppresses and overrides derivation when nested', () => {
		const code = `variant Key = Key String;
implement Eq Key (
  equals = fn a b => True
);
{Key "a", Key "b"} == {Key "x", Key "y"}`;
		expectSuccess(code, true);
	});

	test('retains polymorphic structural Eq obligations until instantiation', () => {
		expectSuccess('(fn x => {x} == {x}) 1', true);
		expectError('(fn x => {x} == {x}) (fn y => y)', /No implementation/);
		expectSuccess('(fn x => equals {@value x} {@value x}) "ok"', true);
		expectError('(fn x => equals {@value x} {@value x}) (fn y => y)', /No implementation/);
		expectSuccess('(fn x => [{x}] == [{x}]) 1', true);
		expectError('(fn x => [{x}] == [{x}]) (fn y => y)', /No implementation/);

		expectError('(fn x => fn y => {x} == {x}) (fn z => z) 1', /No implementation/);
		expectError('(fn x => fn y => equals {@value x} {@value x}) (fn z => z) 1', /No implementation/);
		expectSuccess('(fn x => fn y => {y} == {y}) (fn z => z) 1', true);
		expectError('(fn x => fn y => {y} == {y}) 1 (fn z => z)', /No implementation/);

		const infixBeforeCall = '(fn x => (same = {x} == {x}; x 1)) (fn z => z)';
		const directBeforeCall = '(fn x => (same = equals {@value x} {@value x}; x 1)) (fn z => z)';
		expectError(infixBeforeCall, /No implementation/);
		expectError(directBeforeCall, /No implementation/);
		expectError('(fn x => (value = x 1; {x} == {x})) (fn z => z)', /No implementation/);
		expectError('(fn x => (value = x 1; equals {@value x} {@value x})) (fn z => z)', /No implementation/);
		expectSuccess('(fn x => (same = {x} == {x}; x + 1)) 1', 2);
		expectSuccess('(fn x y => (same = {x} == {x}; if True then x else [y])) [1] 1', [1]);
		expectError('(fn x y => (same = {x} == {x}; if True then x else [y])) [fn z => z] (fn z => z)', /No implementation/);

		const infixAlias = '(fn x y => (same = {x} == {x}; if True then x else y)) (fn z => z) (fn z => z)';
		const directAlias = '(fn x y => (same = equals {@value x} {@value x}; if True then x else y)) (fn z => z) (fn z => z)';
		const reversedObligation = '(fn x y => (same = {y} == {y}; if True then x else y)) (fn z => z) (fn z => z)';
		const reversedBranches = '(fn x y => (same = {x} == {x}; if True then y else x)) (fn z => z) (fn z => z)';
		expectError(infixAlias, /No implementation/);
		expectError(directAlias, /No implementation/);
		expectError(reversedObligation, /No implementation/);
		expectError(reversedBranches, /No implementation/);

		expectSuccess('variant Box a = Box a; (fn x => (Box x) == (Box x)) 1', true);
		expectError('variant Box a = Box a; (fn x => (Box x) == (Box x)) (fn y => y)', /No implementation/);
		expectSuccess('variant Chain a = End a | Next {a, Chain a}; (fn x => equals (Next {x, End x}) (Next {x, End x})) "ok"', true);
		expectError('variant Chain a = End a | Next {a, Chain a}; (fn x => equals (Next {x, End x}) (Next {x, End x})) (fn y => y)', /No implementation/);
	});

	test('rejects structural and conditional components without Eq', () => {
		expectError('{fn x => x} == {fn x => x}', /No implementation/);
		expectError('{@f (fn x => x)} == {@f (fn x => x)}', /No implementation/);
		expectError(
			'variant Box a = Box a; (Box (fn x => x)) == (Box (fn x => x))',
			/No implementation/
		);
		expectError(
			'variant V = A Float | B (Float -> Float); (A 1) == (A 1)',
			/No implementation/
		);
		expectError('[fn x => x] == [fn x => x]', /No implementation/);
		expectError('equals [fn x => x] [fn x => x]', /No implementation/);
	});
});
