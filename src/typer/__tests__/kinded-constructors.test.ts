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

	test('shared free arguments survive module transport', () => {
		const dir = path.join(process.cwd(), '.test-tmp-kinded-shared-free');
		const modulePath = path.join(dir, 'outer.noo');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			modulePath,
			`constraint F f (fm : (a -> b) -> f a -> f b);
variant Outer error value nested = Outer error value nested;
implement F (typefn value => Outer error value (Option error)) (
  fm = fn f outer => match outer (
    Outer error value nested => Outer error (f value) nested
  )
);
{@make fn error value => Outer error value (Some error)}`
		);
		clearModuleCache();
		try {
			expect(
				inferredType(`{@make} = import "${modulePath.replace(/\.noo$/, '')}";
fm (fn x => x + 1) (make "kept" 2)`)
			).toBe('Outer String Float (Option String)');
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
		).toBe('Outer String Float (Option String)');
	});

	test('a bare trait function rebind remains polymorphic', () => {
		expect(inferredType('b2 = bind; b2 (Ok 1) (fn x => Ok (x + 1))')).toBe(
			'Result Float a'
		);
	});

	test('Option and List retain canonical types', () => {
		expect(inferredType('map (fn x => x + 1) (Some 1)')).toBe('Option Float');
		expect(inferredType('map (fn x => x + 1) [1, 2]')).toBe('List Float');
	});

	test('nested constrained composition keeps one constructor constraint', () => {
		expect(
			inferredType('fn items => map show (map (fn x => x * 2) items)')
		).toBe('a Float -> a String given a implements Functor');
		expect(
			inferredType('(fn items => map show (map (fn x => x * 2) items)) [1, 2]')
		).toBe('List String');
	});

	test('fixed constructor arguments participate in dispatch', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (typefn value => RightMap String value) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
);
right_map (fn x => x + 1) (RightMap 42 2)`)
		).toThrow(/implementation|mismatch|RightFunctor/i);
	});

	test('a function-typed fixed constructor argument dispatches', () => {
		expect(
			inferredType(`constraint FnFixed f (fmap_fn : (a -> b) -> f a -> f b);
variant Handler tag value = Handler tag value;
implement FnFixed (typefn value => Handler (Float -> Float) value) (
  fmap_fn = fn f h => match h (
    Handler tag value => Handler tag (f value)
  )
);
fmap_fn (fn x => x + 1) (Handler (fn y => y + 1) 5)`)
		).toBe('Handler (Float -> Float) Float');
	});

	test('a discharged constructor constraint is not re-emitted as an orphan clause', () => {
		expect(inferredType('fn r => bind r (fn x => Ok x)')).toBe(
			'Result a b -> Result a b'
		);
	});

	test('nested type-application arguments render parenthesized', () => {
		expect(
			inferredType(`constraint AppFixed f (fmap_app : (a -> b) -> f a -> f b);
variant Two tag value = Two tag value;
implement AppFixed (typefn value => Two (Option String) value) (
  fmap_app = fn f t => match t (
    Two tag value => Two tag (f value)
  )
);
fmap_app (fn x => x + 1) (Two (Some "t") 5)`)
		).toBe('Two (Option String) Float');
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

	test('legacy higher-kinded heads are rejected atomically', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor RightMap (
  right_map = fn f rm => rm
)`)
		).toThrow(/explicit typefn/i);
	});

	test('member checking rejects an abstraction that models the wrong slot', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (typefn context => RightMap context value) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
)`)
		).toThrow(/member|rigid|signature/i);
	});

	test('member checking preserves universal-variable independence', () => {
		expect(() =>
			parseAndType(`constraint Pairing a (pair : b -> c -> {b, c});
implement Pairing Float (pair = fn left right => {left, left})`)
		).toThrow(/member|rigid|signature/i);
	});

	test('member effects are subsumed by the declared signature', () => {
		expect(() =>
			parseAndType(`constraint PureRun a (run : a -> {});
implement PureRun Float (run = fn value => print value)`)
		).toThrow(/undeclared effect.*write/i);
		expect(() =>
			parseAndType(`constraint WriteRun a (run : a -> {} !write);
implement WriteRun Float (run = fn value => {})`)
		).not.toThrow();
	});

	test('erased aliases and structural heads have focused diagnostics', () => {
		expect(() =>
			parseAndType(`type Alias a = Option a;
constraint AliasEq a (same : a -> a -> Bool);
implement AliasEq (Alias Float) (same = fn x y => True)`)
		).toThrow(/Alias.*erased.*underlying nominal/i);
		expect(() =>
			parseAndType(`constraint RecordEq a (same : a -> a -> Bool);
implement RecordEq {@x Float} (same = fn x y => True)`)
		).toThrow(/nominal identity|structural/i);
	});

	test('coherence is constructor-wide', () => {
		expect(() =>
			parseAndType(`constraint Mark a (mark : a -> String);
variant Box a = Box a;
implement Mark (Box Float) (mark = fn box => "float");
implement Mark (Box String) (mark = fn box => "string")`)
		).toThrow(/Duplicate implementation.*Mark.*Box/i);
	});
});
