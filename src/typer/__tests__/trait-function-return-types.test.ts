import { test, expect } from 'bun:test';
import {
	assertFunctionType,
	assertListType,
	assertPrimitiveType,
	assertVariantType,
	parseAndType,
} from '../../../test/utils';

test('built-in equality operator returns Bool type', () => {
	const input = '1.0 == 2.0';
	const result = parseAndType(input);

	assertVariantType(result.type);
	expect(result.type.name).toEqual('Bool');
});

test('string equality returns Bool type', () => {
	const input = '"hello" == "world"';
	const result = parseAndType(input);

	assertVariantType(result.type);
	expect(result.type.name).toEqual('Bool');
});

test('equality in lambda functions resolves correctly', () => {
	const input = 'fn x => x == 1.0';
	const result = parseAndType(input);

	assertFunctionType(result.type);
	expect(result.type.params.length).toEqual(1);
	assertPrimitiveType(result.type.params[0]);
	expect(result.type.params[0].name).toEqual('Float');
	assertVariantType(result.type.return);
	expect(result.type.return.name).toEqual('Bool');
});

test('map with basic function works correctly', () => {
	const input = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';
	const result = parseAndType(input);

	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toEqual('Float');
});

test('nested arithmetic expressions type correctly', () => {
	const input = '(1.0 + 2.0) * (3.0 - 4.0)';
	const result = parseAndType(input);

	assertPrimitiveType(result.type);
	expect(result.type.name).toEqual('Float');
});

test('variables and boolean operations complete without exponential unification', () => {
	const program = `
        a = 1.0 == 1.0;
        b = 2.0 == 2.0;
        c = 3.0 == 3.0;
        result = [a, b, c];
        result
    `;

	const result = parseAndType(program);

	assertListType(result.type);
	assertVariantType(result.type.element);
	expect(result.type.element.name).toEqual('Bool');
});
