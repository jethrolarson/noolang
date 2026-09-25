import { describe, expect, test } from 'bun:test';
import type { FunctionType } from '../../ast';
import type { TraitRegistry } from '../../typer/trait-system';
import { Evaluator } from '../evaluator';
import {
	createNativeFunction,
	createString,
	isList,
	isString,
} from '../evaluator-utils';
import {
	createBareEvaluator,
	createTypedEvaluator,
	parseProgram,
} from './helpers';

const BUILTIN_NAMES = [
	'+',
	'-',
	'*',
	'%',
	'/',
	'==',
	'!=',
	'<',
	'>',
	'<=',
	'>=',
	'|',
	'|>',
	'<|',
	';',
	'$',
	'list_get',
	'at',
	'tail',
	'cons',
	'list_map',
	'list_filter',
	'reduce',
	'length',
	'isEmpty',
	'append',
	'list_any',
	'list_find',
	'find',
	'zip',
	'abs',
	'max',
	'min',
	'print',
	'concat',
	'toString',
	'split',
	'chars',
	'char_code',
	'from_char_code',
	'trim',
	'toUpper',
	'toLower',
	'indexOf',
	'startsWith',
	'endsWith',
	'replace',
	'substring',
	'argv',
	'forget',
	'hasKey',
	'hasValue',
	'set',
	'tupleLength',
	'tupleIsEmpty',
	'isSome',
	'isNone',
	'unwrap',
	'isOk',
	'isErr',
	'println',
	'exit',
	'readFile',
	'writeFile',
	'log',
	'random',
	'randomRange',
	'mutSet',
	'mutGet',
	'exec',
	'primitive_float_eq',
	'primitive_string_eq',
	'floatToString',
	'primitive_float_add',
	'primitive_float_multiply',
	'primitive_float_subtract',
	'primitive_float_equals',
	'primitive_string_equals',
	'primitive_string_less_than',
	'primitive_string_greater_than',
	'primitive_string_less_than_or_equal',
	'primitive_string_greater_than_or_equal',
	'primitive_float_less_than',
	'primitive_list_all2',
	'primitive_float_divide',
	'primitive_string_concat',
	'isString',
	'isNumber',
	'isBool',
	'isList',
];

describe('[characterization] evaluator bootstrap contract', () => {
	test('skipStdlib exposes the complete ordered native builtin catalogue', () => {
		const evaluator = createBareEvaluator();
		expect([...evaluator.environment.keys()]).toEqual(BUILTIN_NAMES);
	});

	test('argv captures constructor arguments as runtime strings', () => {
		const { state, program } = createTypedEvaluator('argv');
		const evaluator = new Evaluator({
			traitRegistry: state.traitRegistry,
			skipStdlib: true,
			programArgs: ['first', '--flag'],
		});
		const result = evaluator.evaluateProgram(program).finalResult;
		expect(isList(result)).toBe(true);
		if (!isList(result)) throw new Error('expected argv list');
		expect(result.values).toEqual([
			{ tag: 'string', value: 'first' },
			{ tag: 'string', value: '--flag' },
		]);
	});
});

describe('[characterization] evaluator state restoration', () => {
	test('match bindings are removed when the selected branch throws', () => {
		const evaluator = createBareEvaluator();
		expect(() =>
			evaluator.evaluateProgram(
				parseProgram('outer = 1; match 1 (bound => missing)')
			)
		).toThrow('Undefined variable: missing');
		const environment = evaluator.getEnvironment();
		expect(environment.has('outer')).toBe(true);
		expect(environment.has('bound')).toBe(false);
	});

	test('where bindings are removed when the main expression throws', () => {
		const evaluator = createBareEvaluator();
		expect(() =>
			evaluator.evaluateProgram(
				parseProgram('outer = 1; missing where (inner = 2)')
			)
		).toThrow('Undefined variable: missing');
		const environment = evaluator.getEnvironment();
		expect(environment.has('outer')).toBe(true);
		expect(environment.has('inner')).toBe(false);
	});
});

test('[characterization] destructuring retains earlier bindings when a later nested binding fails', () => {
	const evaluator = createBareEvaluator();
	expect(() =>
		evaluator.evaluateProgram(
			parseProgram('{@first, @nested {left, right}} = {@first 1, @nested {2}}')
		)
	).toThrow('Nested tuple destructuring length mismatch');
	expect(evaluator.getEnvironment().get('first')).toEqual({
		tag: 'number',
		value: 1,
	});
});

test('[characterization] trait dispatch prefers a captured implementation closure over its AST fallback', () => {
	const fallback = parseProgram('fn value => "ast"').statements[0];
	const registry: TraitRegistry = {
		definitions: new Map([
			[
				'Pick',
				{
					name: 'Pick',
					typeParam: 'a',
					functions: new Map([['pick', {} as FunctionType]]),
				},
			],
		]),
		implementations: new Map([
			[
				'Pick',
				new Map([
					[
						'Float',
						{
							typeName: 'Float',
							functions: new Map([['pick', fallback]]),
							evaluatedFunctions: new Map([
								[
									'pick',
									createNativeFunction('captured-pick', () =>
										createString('captured')
									),
								],
							]),
						},
					],
				]),
			],
		]),
		functionTraits: new Map([['pick', ['Pick']]]),
	};
	const evaluator = createBareEvaluator(registry);
	const result = evaluator.evaluateProgram(parseProgram('pick 1')).finalResult;
	expect(isString(result)).toBe(true);
	if (!isString(result)) throw new Error('expected string result');
	expect(result.value).toBe('captured');
});
