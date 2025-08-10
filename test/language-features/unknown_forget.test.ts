import { test, expect, describe } from 'bun:test';
import { parseAndType, runCode, assertVariantType } from '../utils';
import { typeToString } from '../../src/typer/helpers';

describe('Unknown + forget (MVP)', () => {
	test('forget has type a -> Unknown and forget 42 yields Unknown', () => {
		const result = parseAndType('forget 42');
		expect(typeToString(result.type, result.state.substitution)).toBe(
			'Unknown'
		);
		// no effects for pure forget
		expect(result.effects.size).toBe(0);
	});

	test('forget is identity at runtime', () => {
		const evalResult = runCode('forget 42');
		expect(evalResult.finalValue).toBe(42);
	});

  test('@field? on native records returns Option and is pure', () => {
		const res = parseAndType('r = { @name "Alice" }; r | @name?');
		assertVariantType(res.type);
		expect(res.type.name).toBe('Option');
		expect(res.effects.size).toBe(0);
	});
});
