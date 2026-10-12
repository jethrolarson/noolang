import { describe, expect, test } from 'bun:test';
import type { FunctionType, VariableExpression } from '../../ast';
import {
	createTraitRegistry,
	type TraitImplementation,
	type TraitRegistry,
} from '../../typer/trait-system';
import {
	applyTraitFunctionWithValues,
	evaluateTraitFunctionApplication,
	resolveTraitFunctionWithArgs,
	resolveTraitValue,
	type TraitRuntimeContext,
} from '../trait-runtime';
import {
	createConstructor,
	createList,
	createNativeFunction,
	createNumber,
	createRecord,
	createString,
} from '../evaluator-utils';
import { createBareEvaluator, parseProgram } from './helpers';

const functionType = {} as FunctionType;

const addTrait = (
	registry: TraitRegistry,
	traitName: string,
	functionName: string
) => {
	registry.definitions.set(traitName, {
		name: traitName,
		typeParam: 'a',
		functions: new Map([[functionName, functionType]]),
	});
	registry.implementations.set(traitName, new Map());
	registry.functionTraits.set(functionName, [traitName]);
};

const context = (
	registry: TraitRegistry,
	evaluateExpression: TraitRuntimeContext['evaluateExpression'] = () => {
		throw new Error('unexpected AST fallback');
	},
	variantNameForConstructor: TraitRuntimeContext['variantNameForConstructor'] = () =>
		undefined
): TraitRuntimeContext => ({
	traitRegistry: registry,
	evaluateExpression,
	variantNameForConstructor,
});

describe('callable trait runtime', () => {
	test('dispatches on the last argument before falling back to the first', () => {
		const registry = createTraitRegistry();
		addTrait(registry, 'Choose', 'choose');
		registry.implementations.get('Choose')!.set('Float', {
			typeName: 'Float',
			functions: new Map(),
			evaluatedFunctions: new Map([
				[
					'choose',
					createNativeFunction(
						'float-choice',
						() => () => createString('first')
					),
				],
			]),
		});
		registry.implementations.get('Choose')!.set('List', {
			typeName: 'List',
			functions: new Map(),
			evaluatedFunctions: new Map([
				[
					'choose',
					createNativeFunction('list-choice', () => () => createString('last')),
				],
			]),
		});

		expect(
			resolveTraitFunctionWithArgs(
				context(registry),
				'choose',
				[createNumber(1), createList([])],
				registry
			)
		).toEqual(createString('last'));
		expect(
			resolveTraitFunctionWithArgs(
				context(registry),
				'choose',
				[createNumber(1), createRecord({})],
				registry
			)
		).toEqual(createString('first'));
	});

	test('a missing unary implementation preserves the registry on its partial value', () => {
		const registry = createTraitRegistry();
		addTrait(registry, 'Choose', 'choose');
		const result = resolveTraitFunctionWithArgs(
			context(registry),
			'choose',
			[createString('unknown implementation')],
			registry
		);

		expect(result.tag).toBe('trait-function');
		if (result.tag !== 'trait-function') throw new Error('expected partial');
		expect(result.traitRegistry).toBe(registry);
		expect(result.partialArgs).toEqual([
			createString('unknown implementation'),
		]);
	});

	test('direct applications retain the trait-function value registry', () => {
		const evaluatorRegistry = createTraitRegistry();
		const functionRegistry = createTraitRegistry();
		addTrait(functionRegistry, 'Describe', 'describe');
		functionRegistry.implementations.get('Describe')!.set('Float', {
			typeName: 'Float',
			functions: new Map(),
			evaluatedFunctions: new Map([
				[
					'describe',
					createNativeFunction('describe-float', () => createString('owned')),
				],
			]),
		});
		const traitFunction = {
			tag: 'trait-function' as const,
			name: 'describe',
			traitRegistry: functionRegistry,
		};

		expect(
			applyTraitFunctionWithValues(context(evaluatorRegistry), traitFunction, [
				createNumber(1),
			])
		).toEqual(createString('owned'));
		expect(
			evaluateTraitFunctionApplication(
				context(evaluatorRegistry, () => createNumber(1)),
				traitFunction,
				[parseProgram('1').statements[0]]
			)
		).toEqual(createString('owned'));
	});

	test('imported constructor mappings dispatch through their variant type', () => {
		const registry = createTraitRegistry();
		addTrait(registry, 'Describe', 'describe');
		registry.implementations.get('Describe')!.set('Shape', {
			typeName: 'Shape',
			functions: new Map(),
			evaluatedFunctions: new Map([
				[
					'describe',
					createNativeFunction('describe-shape', () => createString('shape')),
				],
			]),
		});

		expect(
			applyTraitFunctionWithValues(
				context(registry, undefined, name =>
					name === 'Circle' ? 'Shape' : undefined
				),
				{
					tag: 'trait-function',
					name: 'describe',
					traitRegistry: registry,
				},
				[createConstructor('Circle', [createNumber(2)])]
			)
		).toEqual(createString('shape'));
	});
});

describe('associated-value runtime', () => {
	test('prefers a captured associated value over its AST fallback', () => {
		const registry = createTraitRegistry();
		const fallback = parseProgram('41').statements[0];
		registry.implementations.set(
			'Default',
			new Map([
				[
					'Float',
					{
						typeName: 'Float',
						functions: new Map(),
						values: new Map([['default', fallback]]),
						evaluatedValues: new Map([['default', createNumber(42)]]),
					},
				],
			])
		);

		expect(
			resolveTraitValue(context(registry), 'default', {
				traitName: 'Default',
				typeName: 'Float',
			})
		).toEqual(createNumber(42));
	});

	test('evaluates an AST fallback once and memoizes it on the shared registry', () => {
		const registry = createTraitRegistry();
		const fallback = parseProgram('42').statements[0];
		const implementation: TraitImplementation = {
			typeName: 'Float',
			functions: new Map(),
			values: new Map([['default', fallback]]),
		};
		registry.implementations.set(
			'Default',
			new Map([['Float', implementation]])
		);
		let evaluations = 0;
		const runtime = context(registry, () => {
			evaluations += 1;
			return createNumber(42);
		});
		const selection = { traitName: 'Default', typeName: 'Float' };

		expect(resolveTraitValue(runtime, 'default', selection)).toEqual(
			createNumber(42)
		);
		expect(resolveTraitValue(runtime, 'default', selection)).toEqual(
			createNumber(42)
		);
		expect(evaluations).toBe(1);
		expect(implementation.evaluatedValues?.get('default')).toEqual(
			createNumber(42)
		);
	});

	test('an ordinary environment binding takes precedence over decorated selection', () => {
		const registry = createTraitRegistry();
		const evaluator = createBareEvaluator(registry);
		evaluator.environment.set('default', createNumber(7));
		const expression = parseProgram('default')
			.statements[0] as VariableExpression;
		expression.traitValueSelection = {
			traitName: 'Default',
			typeName: 'Float',
		};

		expect(evaluator.evaluateExpression(expression)).toEqual(createNumber(7));
	});
});
