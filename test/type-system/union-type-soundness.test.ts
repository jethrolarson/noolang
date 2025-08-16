import { test, describe, expect } from 'bun:test';
import { expectError, expectSuccess } from '../utils';

describe('Union Type Soundness', () => {
	test('union type cannot be used where concrete type expected - cons case', () => {
		// This should FAIL for soundness
		// If x could be String at runtime, cons x [1] would create ["string", 1]
		// which violates list homogeneity
		expectError(`
			type StringOrFloat = String | Float;
			x = "hello" : StringOrFloat;
			cons x [1]
		`, /Cannot.*union.*pattern matching/);
	});

	test('union type cannot be used where concrete type expected - arithmetic case', () => {
		// This should FAIL for soundness
		// If x could be String at runtime, x + 1 would be string concatenation
		expectError(`
			type StringOrFloat = String | Float;
			x = 42 : StringOrFloat;
			x + 1
		`, /Cannot.*union.*pattern matching/);
	});

	test('union type cannot be passed to function expecting concrete type', () => {
		// This should FAIL for soundness
		// If val could be String at runtime, f val would fail
		expectError(`
			type StringOrFloat = String | Float;
			f = fn x => x * 2;
			val = 42 : StringOrFloat;
			f val
		`, /Cannot.*union.*pattern matching/);
	});

	test('proper ADT solution works with identity function', () => {
		// This should SUCCEED - using proper ADT instead of union
		// ADTs create tagged values that preserve type safety
		expectSuccess(`
			variant StringOrFloat = Str String | Flo Float;
			identity = fn x => x : StringOrFloat -> StringOrFloat;
			val = Flo 42;
			result = identity val;
			result
		`, expect.any(Object));
	});

	test('concrete type can be used in union type annotation context', () => {
		// This should SUCCEED - safe subtyping for type annotations
		// Concrete type can be annotated as union type
		expectSuccess(`
			type StringOrFloat = String | Float;
			x = 42 : StringOrFloat;
			x
		`, 42);
	});

	test('union types require pattern matching for operations - placeholder', () => {
		// This demonstrates that union types need pattern matching
		// Once pattern matching is implemented, this should work:
		// match val (String s => s + " processed"; Float f => f + 1)
		expectError(`
			type StringOrFloat = String | Float;
			val = "hello" : StringOrFloat;
			val + " processed"
		`, /Cannot.*operators.*pattern matching/);
	});
});