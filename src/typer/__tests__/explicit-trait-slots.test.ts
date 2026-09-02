import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { clearModuleCache } from '../../module-loader';
import { expectSuccess, parseAndType } from '../../../test/utils';
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

describe('explicit higher-kinded trait slots', () => {
	test('type holes remain scoped to implementation heads', () => {
		expect(() => parseAndType('1 : _')).toThrow(/parse/i);
	});

	test('the apply-wrapper repro preserves Result argument order', () => {
		expect(
			inferredType(`
apply_result = fn f res => match f (Ok g => map g res; Err e => Err e);
apply_result (Ok (fn x => x + 1)) ((Err "bad") : Result Float String)
`)
		).toBe('Result Float String');
	});

	test('the bind-wrapper repro preserves Result argument order', () => {
		expect(
			inferredType(`
my_bind = fn res f => bind res f;
my_bind (Ok 1) (fn x => Ok (x + 1))
`)
		).toBe('Result Float a');
	});

	test('a bare trait-function rebind remains polymorphic', () => {
		expect(inferredType(`b2 = bind; b2 (Ok 1) (fn x => Ok (x + 1))`)).toBe(
			'Result Float a'
		);
	});

	test('a binary constructor can model its non-leading slot', () => {
		expect(
			inferredType(`${rightFunctor}
implement RightFunctor (RightMap context _) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
);
right_map (fn x => x + 1) (RightMap "kept" 2)
`)
		).toBe('RightMap String Float');
	});

	test('grouped fixed applications share direct named free variables', () => {
		expect(
			inferredType(`
constraint F f (fm : (a -> b) -> f a -> f b);
variant Outer error value nested = Outer error value nested;
implement F (Outer error _ (Option error)) (
  fm = fn f outer => match outer (
    Outer error value nested => Outer error (f value) nested
  )
);
fm (fn x => x + 1) (Outer "kept" 2 (Some "kept"))
`)
		).toBe('Outer String Float Option String');
	});

	test('fixed constructor arguments must match during dispatch', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (RightMap String _) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
);
right_map (fn x => x + 1) (RightMap 42 2)
`)
		).toThrow(/implementation|mismatch|RightFunctor/i);
	});

	test('the same slot-1 body is rejected under a slot-0 head', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (RightMap _ value) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
)
`)
		).toThrow(/implementation|signature|slot/i);
	});

	test('traits cannot mix different constructor application arities', () => {
		expect(() =>
			parseAndType(`constraint BadKinds f (
  one : f a -> f a;
  two : f a b -> f a b
)`)
		).toThrow(/inconsistently/i);
	});

	test('erased aliases cannot provide instance identity', () => {
		expect(() =>
			parseAndType(`type Alias a = Option a;
constraint AliasFunctor f ( alias_map : (a -> b) -> f a -> f b );
implement AliasFunctor (Alias _) (
  alias_map = fn f value => value
)`)
		).toThrow(/Unknown ADT|nominal/i);
	});

	test('higher-kinded implementations require explicit holes', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor RightMap (
  right_map = fn f rm => rm
)
`)
		).toThrow(/explicit|_/i);
	});

	test('hole count must equal trait constructor arity', () => {
		expect(() =>
			parseAndType(`${rightFunctor}
implement RightFunctor (RightMap _ _) (
  right_map = fn f rm => rm
)
`)
		).toThrow(/hole|slot|1/i);
	});

	test('Option and List use canonical explicit heads', () => {
		expect(inferredType('map (fn x => x + 1) (Some 1)')).toBe('Option Float');
		expect(inferredType('map (fn x => x + 1) [1, 2]')).toBe('List Float');
	});

	test('ordinary conditional value instances retain their meaning', () => {
		expectSuccess('equals (Ok 1) (Ok 1)', true);
	});
});

describe('explicit trait slot module transport', () => {
	test('an imported descriptor preserves sharing inside grouped fixed applications', () => {
		const dir = path.join(
			process.cwd(),
			'.test-tmp-explicit-trait-slots-nested'
		);
		const modulePath = path.join(dir, 'outer.noo');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			modulePath,
			`
constraint F f (fm : (a -> b) -> f a -> f b);
variant Outer error value nested = Outer error value nested;
implement F (Outer error _ (Option error)) (
  fm = fn f outer => match outer (
    Outer error value nested => Outer error (f value) nested
  )
);
{@make fn error value => Outer error value (Some error)}
`
		);
		clearModuleCache();
		try {
			expect(
				inferredType(`
{@make} = import "${modulePath.replace(/\.noo$/, '')}";
fm (fn x => x + 1) (make "kept" 2)
`)
			).toBe('Outer String Float Option String');
		} finally {
			clearModuleCache();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('an imported slot descriptor preserves non-leading argument order', () => {
		const dir = path.join(process.cwd(), '.test-tmp-explicit-trait-slots');
		const modulePath = path.join(dir, 'right-map.noo');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			modulePath,
			`${rightFunctor}
implement RightFunctor (RightMap context _) (
  right_map = fn f rm => match rm (
    RightMap context value => RightMap context (f value)
  )
);
{@make fn context value => RightMap context value}
`
		);
		clearModuleCache();
		try {
			expect(
				inferredType(`
{@make} = import "${modulePath.replace(/\.noo$/, '')}";
right_map (fn x => x + 1) (make "kept" 2)
`)
			).toBe('RightMap String Float');
		} finally {
			clearModuleCache();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
