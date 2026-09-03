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

	test('documents the remaining wrapper boundary', () => {
		const inferred = inferredType(`${rightFunctor}${implementation}
my_right_map = fn f rm => right_map f rm;
my_right_map (fn x => x + 1) (RightMap "kept" 2)`);
		expect(inferred).toBe('RightMap Float');
		expect(inferred).not.toBe('RightMap String Float');
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
mapper = right_map (fn x => x + 1);
mapper (make "kept" 2)`)
			).toBe('RightMap String Float');
		} finally {
			clearModuleCache();
			fs.rmSync(dir, { recursive: true, force: true });
		}
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
