import { describe, expect, test } from 'bun:test';
import { expressionToString } from '../trace-format';
import { parseProgram } from './helpers';

describe('expressionToString', () => {
	test('preserves established trace rendering', () => {
		const cases = [
			['fn x => x + 1', 'fn x => x + 1'],
			['if True then 1 else 2', 'if True then 1 else 2'],
			['value = fn x => x', 'value = fn x => x'],
			['{@field 1}', '{ field = 1 }'],
			['@field?', '@field?'],
		] as const;
		for (const [source, expected] of cases) {
			expect(expressionToString(parseProgram(source).statements[0])).toBe(
				expected
			);
		}
	});

	test('keeps unsupported expression kinds as unknown', () => {
		expect(expressionToString(parseProgram('{1, 2}').statements[0])).toBe(
			'unknown'
		);
	});
});
