import { describe, expect, test } from 'bun:test';
import { containsVariable } from '../recursion-analysis';
import { parseProgram } from './helpers';

describe('containsVariable', () => {
	test('walks recursive expression-bearing nodes', () => {
		const expression = parseProgram(
			'result = if check then (fn arg => target arg) else ({@field target}; [target])'
		).statements[0];
		expect(containsVariable(expression, 'target')).toBe(true);
		expect(containsVariable(expression, 'absent')).toBe(false);
	});

	test('detects mutation targets and ignores leaf-only nodes', () => {
		expect(
			containsVariable(parseProgram('mut! target = 1').statements[0], 'target')
		).toBe(true);
		expect(
			containsVariable(parseProgram('import "target"').statements[0], 'target')
		).toBe(false);
		expect(
			containsVariable(parseProgram('@target').statements[0], 'target')
		).toBe(false);
	});
});
