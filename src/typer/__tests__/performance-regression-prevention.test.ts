import {
	assertListType,
	assertPrimitiveType,
	assertVariantType,
	parseAndType,
} from '../../../test/utils';
import { resetUnificationCounters, getUnificationStats } from '../unify';
import { test, expect } from 'bun:test';

test('arithmetic operations complete quickly', () => {
	const input = `
        a = 1.0 + 2.0;
        b = a * 3.0;
        c = b - 4.0;
        [a, b, c]
    `;

	resetUnificationCounters();
	const startTime = Date.now();
	const result = parseAndType(input);
	const endTime = Date.now();
	const stats = getUnificationStats();

	// Should complete quickly
	expect(endTime - startTime < 500).toBeTruthy();

	// Should not have excessive unification calls
	if (stats) {
		expect(stats.calls < 1000).toBeTruthy();
	}

	// Should return List Float
	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toEqual('Float');
});

test('equality operations remain performant', () => {
	const input = `
        eq1 = 1.0 == 1.0;
        eq2 = 2.0 == 3.0;
        eq3 = "hello" == "world";
        [eq1, eq2, eq3]
    `;

	resetUnificationCounters();
	const startTime = Date.now();
	const result = parseAndType(input);
	const endTime = Date.now();
	const stats = getUnificationStats();

	// Should complete quickly
	expect(endTime - startTime < 800).toBeTruthy();

	// Should not have excessive unification calls
	if (stats) {
		expect(stats.calls < 1500).toBeTruthy();
	}

	// Should return List Bool
	assertListType(result.type);
	assertVariantType(result.type.element);
	expect(result.type.element.name).toEqual('Bool');
});

test('nested function application performs well', () => {
	const input = `
        myAdd = fn x y => x + y;
        myMul = fn x y => x * y;
        result1 = myAdd 1.0 2.0;
        result2 = myMul result1 3.0;
        result2
    `;

	resetUnificationCounters();
	const startTime = Date.now();
	const result = parseAndType(input);
	const endTime = Date.now();
	const stats = getUnificationStats();

	// Should complete quickly
	expect(endTime - startTime < 600).toBeTruthy();

	// Should not have excessive unification calls
	if (stats) {
		expect(stats.calls < 1200).toBeTruthy();
	}

	// Should return Float
	assertPrimitiveType(result.type);
	expect(result.type.name).toEqual('Float');
});

test('stdlib loading does not cause performance regression', () => {
	// Simple expression that uses stdlib functions
	const input = 'map (fn x => x + 1.0) [1.0, 2.0, 3.0]';

	resetUnificationCounters();
	const startTime = Date.now();
	const result = parseAndType(input);
	const endTime = Date.now();

	// Should complete in reasonable time even with stdlib loading
	expect(endTime - startTime < 2000).toBeTruthy();

	// Should return List Float
	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toEqual('Float');
});
