import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
// uvu test imports
import { test as uvuTest } from 'uvu';
import * as assert from 'uvu/assert';

// Dual Jest/uvu compatibility
const isJest = typeof jest !== 'undefined';
const testFn = isJest ? test : uvuTest;
const describeFn = isJest ? describe : (name, fn) => fn(); // uvu doesn't use describe, just run the function
const expectFn = isJest ? expect : (actual) => ({
  toBe: (expected) => assert.is(actual, expected),
  toEqual: (expected) => {
    if (Array.isArray(expected) && expected.some(item => item && typeof item === 'object' && item.asymmetricMatch)) {
      // Handle expectAnything() in arrays
      assert.is(Array.isArray(actual), true);
      assert.is(actual.length, expected.length);
      for (let i = 0; i < expected.length; i++) {
        if (expected[i] && expected[i].asymmetricMatch) {
          assert.ok(actual[i] !== undefined);
        } else {
          assert.equal(actual[i], expected[i]);
        }
      }
    } else {
      assert.equal(actual, expected);
    }
  },
  toThrow: () => assert.throws(actual),
});
const expectAnything = () => ({ asymmetricMatch: () => true });



describeFn('Records, Tuples, and Unit', () => {
	function parseNoo(src: string) {
		const lexer = new Lexer(src);
		const tokens = lexer.tokenize();
		return parse(tokens);
	}

	testFn('parses named record', () => {
		const program = parseNoo('{ @a 1, @b 2 }');
		const record = program.statements[0];
		expectFn(record.kind).toBe('record');
		if (record.kind === 'record') {
			expectFn(record.fields).toEqual([
				{ name: 'a', value: expectAnything() },
				{ name: 'b', value: expectAnything() },
			]);
		}
	});

	testFn('parses tuple (nameless record)', () => {
		const program = parseNoo('{ 1, 2 }');
		const tuple = program.statements[0];
		expectFn(tuple.kind).toBe('tuple');
		if (tuple.kind === 'tuple') {
			expectFn(tuple.elements.length).toBe(2);
			expectFn(tuple.elements[0]).toEqual(expectAnything());
			expectFn(tuple.elements[1]).toEqual(expectAnything());
		}
	});

	testFn('parses unit (empty braces)', () => {
		const program = parseNoo('{ }');
		const unit = program.statements[0];
		expectFn(unit.kind).toBe('unit');
	});

	testFn('throws on mixed named and positional fields', () => {
		expectFn(() => parseNoo('{ 1, @a 2 }')).toThrow();
		expectFn(() => parseNoo('{ @a 2, 1 }')).toThrow();
	});
});

// Run tests with uvu if not in Jest environment
if (!isJest && typeof uvuTest.run === 'function') {
  uvuTest.run();
}
