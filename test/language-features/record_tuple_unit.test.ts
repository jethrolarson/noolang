import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';

// Conditional imports and setup based on test runner
const isJest = typeof jest !== 'undefined' || typeof global.describe !== 'undefined';
let test: any, describe: any, expect: any, assert: any;

if (!isJest) {
	// uvu environment
	const uvu = require('uvu');
	const uvuAssert = require('uvu/assert');
	test = uvu.test;
	assert = uvuAssert;
	// Create Jest-like expect interface for uvu
	expect = (actual: any) => ({
		toBe: (expected: any) => assert.is(actual, expected),
		toEqual: (expected: any) => {
			// Handle arrays with expect.anything()
			if (Array.isArray(expected)) {
				assert.is(Array.isArray(actual), true);
				assert.is(actual.length, expected.length);
				for (let i = 0; i < expected.length; i++) {
					if (expected[i] && expected[i].asymmetricMatch) {
						// Skip expect.anything() items - just check they exist
						assert.ok(actual[i] !== undefined);
					} else {
						assert.equal(actual[i], expected[i]);
					}
				}
			} else if (expected && typeof expected === 'object' && expected.asymmetricMatch) {
				// Handle expect.anything() - just check that actual exists
				assert.ok(actual !== undefined && actual !== null);
			} else {
				assert.equal(actual, expected);
			}
		},
		toThrow: () => assert.throws(actual),
	});
	expect.anything = () => ({ asymmetricMatch: () => true });
	// Create Jest-like describe for uvu (just run the function)
	describe = (name: string, fn: () => void) => fn();
} else {
	// Jest environment - use globals
	test = global.test;
	describe = global.describe; 
	expect = global.expect;
}

describe('Records, Tuples, and Unit', () => {
	function parseNoo(src: string) {
		const lexer = new Lexer(src);
		const tokens = lexer.tokenize();
		return parse(tokens);
	}

	test('parses named record', () => {
		const program = parseNoo('{ @a 1, @b 2 }');
		const record = program.statements[0];
		expect(record.kind).toBe('record');
		if (record.kind === 'record') {
			expect(record.fields).toEqual([
				{ name: 'a', value: expect.anything() },
				{ name: 'b', value: expect.anything() },
			]);
		}
	});

	test('parses tuple (nameless record)', () => {
		const program = parseNoo('{ 1, 2 }');
		const tuple = program.statements[0];
		expect(tuple.kind).toBe('tuple');
		if (tuple.kind === 'tuple') {
			expect(tuple.elements.length).toBe(2);
			expect(tuple.elements[0]).toEqual(expect.anything());
			expect(tuple.elements[1]).toEqual(expect.anything());
		}
	});

	test('parses unit (empty braces)', () => {
		const program = parseNoo('{ }');
		const unit = program.statements[0];
		expect(unit.kind).toBe('unit');
	});

	test('throws on mixed named and positional fields', () => {
		expect(() => parseNoo('{ 1, @a 2 }')).toThrow();
		expect(() => parseNoo('{ @a 2, 1 }')).toThrow();
	});
});

// Run tests if using uvu
if (!isJest && typeof test.run === 'function') {
	test.run();
}
