import { describe, expect, test } from 'bun:test';
import { createBareEvaluator, parseProgram } from './helpers';

describe('[characterization] evaluator state ownership', () => {
	test('top-level bindings persist across evaluateProgram calls', () => {
		const evaluator = createBareEvaluator();
		evaluator.evaluateProgram(parseProgram('persisted = 40'));
		const result = evaluator.evaluateProgram(parseProgram('persisted + 2'));
		expect(result.finalResult).toEqual({ tag: 'number', value: 42 });
	});

	test('closures snapshot immutable bindings when they are created', () => {
		const evaluator = createBareEvaluator();
		const result = evaluator.evaluateProgram(
			parseProgram('value = 1; read = fn {} => value; value = 2; read {}')
		);
		expect(result.finalResult).toEqual({ tag: 'number', value: 1 });
	});

	test('closures share mutable cells captured from their lexical map', () => {
		const evaluator = createBareEvaluator();
		const result = evaluator.evaluateProgram(
			parseProgram('mut value = 1; read = fn {} => value; mut! value = 2; read {}')
		);
		expect(result.finalResult).toEqual({ tag: 'number', value: 2 });
	});

	test('ProgramResult environments are de-celled snapshots', () => {
		const evaluator = createBareEvaluator();
		const before = evaluator.evaluateProgram(parseProgram('mut value = 1'));
		evaluator.evaluateProgram(parseProgram('mut! value = 2'));

		expect(before.environment.get('value')).toEqual({ tag: 'number', value: 1 });
		expect(evaluator.getEnvironment().get('value')).toEqual({
			tag: 'number',
			value: 2,
		});
	});

	test('an empty program returns an empty list while preserving environment', () => {
		const evaluator = createBareEvaluator();
		evaluator.evaluateProgram(parseProgram('persisted = 1'));
		const result = evaluator.evaluateProgram(parseProgram(''));

		expect(result.finalResult).toEqual({ tag: 'list', values: [] });
		expect(result.executionTrace).toEqual([]);
		expect(result.environment.get('persisted')).toEqual({
			tag: 'number',
			value: 1,
		});
	});
});
