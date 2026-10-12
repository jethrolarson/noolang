import { describe, expect, mock, test } from 'bun:test';
import * as defaultFs from 'node:fs';
import * as defaultPath from 'node:path';
import type { FunctionType, ImportExpression, Type } from '../../ast';
import { createNumber } from '../evaluator-utils';
import {
	evaluateRuntimeImport,
	mergeImportedMetadata,
	type ImportRuntimeContext,
	type RuntimeModuleCache,
} from '../runtime-imports';
import {
	createTraitRegistry,
	type TraitDefinition,
	type TraitImplementation,
} from '../../typer/trait-system';

const importExpression = (path: string): ImportExpression => ({
	kind: 'import',
	path,
	location: {
		start: { line: 3, column: 5 },
		end: { line: 3, column: 19 },
	},
});

const moduleCache = (
	overrides: Partial<RuntimeModuleCache> = {}
): RuntimeModuleCache => ({
	exportValue: createNumber(42),
	adtDiff: new Map(),
	traitDefDiff: new Map(),
	traitImplDiff: new Map(),
	...overrides,
});

const realFsContext = (
	overrides: Partial<ImportRuntimeContext> = {}
): ImportRuntimeContext => ({
	fs: defaultFs,
	path: defaultPath,
	usesCustomFileSystem: false,
	currentFileDir: '/home/importer',
	createChildEvaluator: () => {
		throw new Error('real imports must not create a direct child evaluator');
	},
	loadModule: () => moduleCache(),
	mergeMetadata: () => {},
	...overrides,
});

describe('runtime import extraction seam', () => {
	test('custom filesystems keep the direct path and create a fresh child for each import', () => {
		const readFileSync = mock(() => '7');
		const customFs = { readFileSync };
		const evaluateProgram = mock(() => ({ finalResult: createNumber(7) }));
		const createChildEvaluator = mock(() => ({ evaluateProgram }));
		const loadModule = mock(() => moduleCache());
		const context = realFsContext({
			fs: customFs,
			usesCustomFileSystem: true,
			currentFileDir: '/project/nested',
			createChildEvaluator,
			loadModule,
		});

		evaluateRuntimeImport(importExpression('../dep'), context);
		evaluateRuntimeImport(importExpression('../dep'), context);

		expect(readFileSync).toHaveBeenCalledTimes(2);
		expect(readFileSync).toHaveBeenCalledWith('/project/dep.noo', 'utf8');
		expect(createChildEvaluator).toHaveBeenCalledTimes(2);
		expect(evaluateProgram).toHaveBeenCalledWith(
			expect.any(Object),
			'/project/dep.noo'
		);
		expect(loadModule).not.toHaveBeenCalled();
	});

	test('custom filesystem failures bypass structured real-loader wrapping', () => {
		const rawFailure = new Error('custom read failed');
		const customFs = {
			readFileSync: () => {
				throw rawFailure;
			},
		};

		expect(() =>
			evaluateRuntimeImport(
				importExpression('./missing'),
				realFsContext({ fs: customFs, usesCustomFileSystem: true })
			)
		).toThrow(rawFailure);
	});

	test('real imports pass the untouched specifier and home directory to the lazy loader', () => {
		const exported = createNumber(9);
		const loadModule = mock(() => moduleCache({ exportValue: exported }));

		const result = evaluateRuntimeImport(
			importExpression('./sibling'),
			realFsContext({ loadModule, currentFileDir: '/module/home' })
		);

		expect(loadModule).toHaveBeenCalledWith('./sibling', '/module/home');
		expect(result).toBe(exported);
	});

	test('merges constructor, trait, function, and associated-value metadata without replacing identities', () => {
		const traitRegistry = createTraitRegistry();
		const existingFunctions = new Map<string, unknown>([
			['old', createNumber(1)],
		]);
		const existingValues = new Map<string, unknown>([
			['oldValue', createNumber(2)],
		]);
		const existingImpl = {
			typeName: 'Existing',
			functions: new Map(),
			evaluatedFunctions: existingFunctions,
			evaluatedValues: existingValues,
		} satisfies TraitImplementation;
		const emptyExistingImpl: TraitImplementation = {
			typeName: 'Backfilled',
			functions: new Map(),
		};
		traitRegistry.implementations.set(
			'Visible',
			new Map<string, TraitImplementation>([
				['Existing', existingImpl],
				['Backfilled', emptyExistingImpl],
			])
		);

		const importedImpl = {
			typeName: 'Fresh',
			functions: new Map(),
			evaluatedFunctions: new Map([['show', createNumber(3)]]),
			evaluatedValues: new Map([['default', createNumber(4)]]),
		} satisfies TraitImplementation;
		const attemptedBackfill = {
			...existingImpl,
			evaluatedFunctions: new Map([['new', createNumber(5)]]),
			evaluatedValues: new Map([['newValue', createNumber(6)]]),
		} satisfies TraitImplementation;
		const backfillFunctions = new Map([['show', createNumber(7)]]);
		const backfillValues = new Map([['default', createNumber(8)]]);
		const backfillSource = {
			...emptyExistingImpl,
			evaluatedFunctions: backfillFunctions,
			evaluatedValues: backfillValues,
		} satisfies TraitImplementation;
		const stringType: Type = { kind: 'primitive', name: 'String' };
		const showType: FunctionType = {
			kind: 'function',
			params: [],
			return: stringType,
			effects: new Set(),
		};
		const traitDefinition = {
			name: 'Visible',
			typeParam: 'a',
			functions: new Map([['show', showType]]),
			values: new Map([['default', stringType]]),
		} satisfies TraitDefinition;
		const registerConstructorVariant = mock(
			(_constructorName: string, _typeName: string) => {}
		);
		const cache = moduleCache({
			adtDiff: new Map([
				[
					'Shape',
					{
						constructors: new Map([
							['Circle', {}],
							['Square', {}],
						]),
					},
				],
			]),
			traitDefDiff: new Map([['Visible', traitDefinition]]),
			traitImplDiff: new Map([
				[
					'Visible',
					new Map([
						['Fresh', importedImpl],
						['Existing', attemptedBackfill],
						['Backfilled', backfillSource],
					]),
				],
			]),
		});

		evaluateRuntimeImport(
			importExpression('./module'),
			realFsContext({
				loadModule: () => cache,
				mergeMetadata: importedCache =>
					mergeImportedMetadata(importedCache, {
						traitRegistry,
						registerConstructorVariant,
					}),
			})
		);

		expect(registerConstructorVariant.mock.calls).toEqual([
			['Circle', 'Shape'],
			['Square', 'Shape'],
		]);
		expect(traitRegistry.definitions.get('Visible')).toBe(traitDefinition);
		expect(traitRegistry.implementations.get('Visible')?.get('Fresh')).toBe(
			importedImpl
		);
		expect(traitRegistry.implementations.get('Visible')?.get('Existing')).toBe(
			existingImpl
		);
		expect(existingImpl.evaluatedFunctions).toBe(existingFunctions);
		expect(existingImpl.evaluatedValues).toBe(existingValues);
		expect(existingFunctions.has('new')).toBe(false);
		expect(existingValues.has('newValue')).toBe(false);
		expect(emptyExistingImpl.evaluatedFunctions).toBe(backfillFunctions);
		expect(emptyExistingImpl.evaluatedValues).toBe(backfillValues);
		expect(traitRegistry.functionTraits.get('show')).toEqual(['Visible']);
		expect(traitRegistry.valueTraits?.get('default')).toEqual(['Visible']);
	});

	test('real loader failures retain the structured ImportError contract', () => {
		let thrown: unknown;
		try {
			evaluateRuntimeImport(
				importExpression('./missing'),
				realFsContext({
					loadModule: () => {
						throw new Error('underlying failure');
					},
				})
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({
			type: 'ImportError',
			location: { line: 3, column: 5, start: 3, end: 3 },
			context: 'import "./missing"',
		});
		if (
			!thrown ||
			typeof thrown !== 'object' ||
			!('message' in thrown) ||
			typeof thrown.message !== 'string'
		) {
			throw new Error('Expected a structured import error');
		}
		expect(thrown.message).toContain(
			"Failed to import './missing': underlying failure"
		);
		expect(thrown.message).toContain(
			'Tried to resolve: /home/importer/missing.noo'
		);
	});
});
