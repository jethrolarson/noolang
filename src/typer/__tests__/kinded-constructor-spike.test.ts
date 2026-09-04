import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { clearModuleCache } from '../../module-loader';
import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

const inferredType = (source: string): string => {
	const decorated = parseAndType(source);
	return typeToString(decorated.type!, decorated.state.substitution);
};

const rightFunctor = `
constraint RightFunctor f (
  right_map : (a -> b) -> f a -> f b
);
variant RightMap context value = RightMap context value;
`;

const implementation = `
implement RightFunctor (typefn value => RightMap context value) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
);
`;

describe('kinded constructor spike', () => {
	test('a non-leading constructor parameter beta-reduces before local inference', () => {
		expect(
			inferredType(`${rightFunctor}${implementation}
mapper = right_map (fn x => x + 1);
mapper (RightMap "kept" 2)`)
		).toBe('RightMap String Float');
	});

	test('a plain wrapper preserves non-leading constructor arguments', () => {
		expect(
			inferredType(`${rightFunctor}${implementation}
my_right_map = fn f rm => right_map f rm;
my_right_map (fn x => x + 1) (RightMap "kept" 2)`)
		).toBe('RightMap String Float');
	});

	test('Result wrappers preserve exact argument order', () => {
		expect(
			inferredType(`
apply_result = fn f res => match f (Ok g => map g res; Err e => Err e);
apply_result (Ok (fn x => x + 1)) ((Err "bad") : Result Float String)`)
		).toBe('Result Float String');
		expect(
			inferredType(`
my_bind = fn res f => bind res f;
my_bind (Ok 1) (fn x => Ok (x + 1))`)
		).toBe('Result Float a');
	});

	test('the same constructor abstraction and dispatch identity survive import', () => {
		const dir = path.join(process.cwd(), '.test-tmp-kinded-constructor');
		const modulePath = path.join(dir, 'right-map.noo');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			modulePath,
			`${rightFunctor}${implementation}\n{@make fn context value => RightMap context value}`
		);
		clearModuleCache();
		try {
			expect(
				inferredType(`{@make} = import "${modulePath.replace(/\.noo$/, '')}";
my_right_map = fn f rm => right_map f rm;
my_right_map (fn x => x + 1) (make "kept" 2)`)
			).toBe('RightMap String Float');
		} finally {
			clearModuleCache();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('multiple modeled arguments retain constructor order', () => {
		expect(
			inferredType(`
constraint BiMap f (
  bimap : (a -> c) -> (b -> d) -> f a b -> f c d
);
variant Framed frame left right = Framed frame left right;
implement BiMap (typefn left right => Framed frame left right) (
  bimap = fn fl fr value => match value (
    Framed frame left right => Framed frame (fl left) (fr right)
  )
);
bimap (fn x => x + 1) show (Framed "kept" 2 True)`)
		).toBe('Framed String Float String');
	});

	test('shared free variables in fixed applications remain linked', () => {
		expect(
			inferredType(`
constraint F f (fm : (a -> b) -> f a -> f b);
variant Outer error value nested = Outer error value nested;
implement F (typefn value => Outer error value (Option error)) (
  fm = fn f outer => match outer (
    Outer error value nested => Outer error (f value) nested
  )
);
fm (fn x => x + 1) (Outer "kept" 2 (Some "kept"))`)
		).toBe('Outer String Float Option String');
	});

	test('kind checking rejects inconsistent constructor application arities', () => {
		expect(() =>
			parseAndType(`constraint BadKinds f (
  one : f a -> f a;
  two : f a b -> f a b
)`)
		).toThrow(/inconsistently/i);
	});

	test('kind checking rejects unsaturated nominal bodies', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (typefn value => RightMap value) (
  right_map = fn f rm => rm
)`)
		).toThrow(/saturated|arity/i);
	});

	test('the abstraction parameter must occur once as a direct argument', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (typefn value => RightMap value (Option value)) (
  right_map = fn f rm => rm
)`)
		).toThrow(/exactly once|direct/i);
	});
});
