import * as defaultPath from 'node:path';
import { describe, expect, mock, test } from 'bun:test';
import { createTraitRegistry } from '../../typer/trait-system';
import { Evaluator } from '../evaluator';
import {
	createConstructor,
	createList,
	createNumber,
	createString,
	isCell,
	isNativeFunction,
	type Value,
} from '../evaluator-utils';
import { createBareEvaluator } from './helpers';

const applyNative = (evaluator: Evaluator, name: string, args: Value[]) => {
	const bound = evaluator.environment.get(name);
	let result: Value | undefined = bound && !isCell(bound) ? bound : undefined;
	for (const arg of args) {
		if (!result || !isNativeFunction(result)) {
			throw new Error(`${name} stopped currying before all arguments were applied`);
		}
		result = result.fn(arg);
	}
	return result;
};

describe('[characterization] builtin bootstrap boundaries', () => {
	test('stdlib loads after 90 natives, adds 31 names, and overwrites none', () => {
		const bare = createBareEvaluator();
		const withStdlib = new Evaluator({ traitRegistry: createTraitRegistry() });
		const nativeNames = [...bare.environment.keys()];

		expect(nativeNames).toHaveLength(90);
		expect(withStdlib.environment.size).toBe(121);
		expect(nativeNames.every(name => withStdlib.environment.has(name))).toBe(true);
	});

	test('native currying retains the native tag and derived partial name', () => {
		const evaluator = createBareEvaluator();
		const bound = evaluator.environment.get('+');
		const add = bound && !isCell(bound) ? bound : undefined;
		expect(add).toMatchObject({ tag: 'native', name: '+' });
		if (!add || !isNativeFunction(add)) throw new Error('expected native +');
		expect(add.fn(createNumber(1))).toMatchObject({
			tag: 'native',
			name: '+_partial',
		});
	});

	test('injected fs is retained by readFile and writeFile closures', () => {
		const writes: unknown[][] = [];
		const fs = {
			readFileSync: mock(() => 'injected contents'),
			writeFileSync: mock((...args: unknown[]) => {
				writes.push(args);
			}),
		} as unknown as typeof import('node:fs');
		const evaluator = new Evaluator({
			fs,
			traitRegistry: createTraitRegistry(),
			skipStdlib: true,
		});

		expect(
			applyNative(evaluator, 'readFile', [createString('/virtual/input.noo')])
		).toEqual(
			createConstructor('Ok', [createString('injected contents')])
		);
		expect(
			applyNative(evaluator, 'writeFile', [
				createString('/virtual/output.noo'),
				createString('saved'),
			])
		).toEqual(createConstructor('Ok', [{ tag: 'unit' }]));
		expect(writes).toEqual([['/virtual/output.noo', 'saved']]);
	});

	test('stdlib search uses the injected fs and falls through candidates in order', () => {
		const checked: string[] = [];
		const fs = {
			existsSync: mock((candidate: string) => {
				checked.push(candidate);
				return checked.length === 2;
			}),
			readFileSync: mock(() => ''),
		} as unknown as typeof import('node:fs');
		new Evaluator({ fs, path: defaultPath, traitRegistry: createTraitRegistry() });

		expect(checked).toHaveLength(2);
		expect(checked[0]).toEndWith('stdlib.noo');
		expect(checked[1]).toBe(defaultPath.join(process.cwd(), 'stdlib.noo'));
		expect(fs.readFileSync).toHaveBeenCalledWith(checked[1], 'utf-8');
	});

	test('missing stdlib logs and throws the same candidate-list message', () => {
		const fs = {
			existsSync: mock(() => false),
		} as unknown as typeof import('node:fs');
		const originalError = console.error;
		const logged: unknown[][] = [];
		console.error = (...args: unknown[]) => logged.push(args);
		try {
			expect(() =>
				new Evaluator({ fs, traitRegistry: createTraitRegistry() })
			).toThrow('[Noolang ERROR] Could not find stdlib.noo');
			expect(logged).toHaveLength(1);
			expect(String(logged[0][0])).toContain(
				'[Noolang ERROR] Could not find stdlib.noo'
			);
		} finally {
			console.error = originalError;
		}
	});
});

describe('[characterization] less-travelled builtin values', () => {
	test('Option and Result predicates return Bool constructors', () => {
		const evaluator = createBareEvaluator();
		expect(
			applyNative(evaluator, 'isSome', [
				createConstructor('Some', [createNumber(1)]),
			])
		).toEqual(createConstructor('True', []));
		expect(
			applyNative(evaluator, 'isNone', [createConstructor('None', [])])
		).toEqual(createConstructor('True', []));
		expect(
			applyNative(evaluator, 'isOk', [
				createConstructor('Ok', [createNumber(1)]),
			])
		).toEqual(createConstructor('True', []));
		expect(
			applyNative(evaluator, 'isErr', [
				createConstructor('Err', [createString('bad')]),
			])
		).toEqual(createConstructor('True', []));
	});

	test('zip keeps its established @1/@2 field representation', () => {
		const evaluator = createBareEvaluator();
		expect(
			applyNative(evaluator, 'zip', [
				createList([createNumber(1)]),
				createList([createString('one')]),
			])
		).toEqual(
			createList([
				{
					tag: 'record',
					fields: {
						'@1': createNumber(1),
						'@2': createString('one'),
					},
				},
			])
		);
	});

	test('raw primitive division returns None on zero', () => {
		const evaluator = createBareEvaluator();
		expect(
			applyNative(evaluator, 'primitive_float_divide', [
				createNumber(10),
				createNumber(0),
			])
		).toEqual(createConstructor('None', []));
	});
});
