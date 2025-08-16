import { expect, test, describe } from 'bun:test';
import { parseAndType } from '../utils';

describe('Type variable sharing bug', () => {
	test('multiple uses of map_err should not share type variables', () => {
		// This should work but currently fails with "Expected: Float, Got: String"
		const testCode = `
			variant DecodeError = TypeMismatch String String;
			f1 = fn x => Ok "hello";
			f2 = fn x => Ok 42;
			result1 = f1 |> map_err (fn e => TypeMismatch "String" "Unknown");
			result2 = f2 |> map_err (fn e => TypeMismatch "Float" "Unknown");
			result2
		`;

		// This should not throw a type error
		expect(() => parseAndType(testCode)).not.toThrow();
	});

	test('multiple uses of map_err with isString and isNumber should work', () => {
		// This is the exact case from schema.noo that's failing
		const testCode = `
			variant DecodeError = TypeMismatch String String;
			string_schema = isString |> map_err (fn e => TypeMismatch "String" "Unknown");
			float_schema = isNumber |> map_err (fn e => TypeMismatch "Float" "Unknown");
			float_schema
		`;

		// This should not throw a type error
		expect(() => parseAndType(testCode)).not.toThrow();
	});

	test('individual map_err uses should work', () => {
		// These should work individually
		const testCode1 = `
			variant DecodeError = TypeMismatch String String;
			string_schema = isString |> map_err (fn e => TypeMismatch "String" "Unknown");
			string_schema
		`;

		const testCode2 = `
			variant DecodeError = TypeMismatch String String;
			float_schema = isNumber |> map_err (fn e => TypeMismatch "Float" "Unknown");
			float_schema
		`;

		expect(() => parseAndType(testCode1)).not.toThrow();
		expect(() => parseAndType(testCode2)).not.toThrow();
	});

	test('multiple map_err instantiations should have different type variables', () => {
		// Test that map_err gets fresh type variables each time it's used
		const testCode = `
			me1 = map_err;
			me2 = map_err;
			me2
		`;

		const result = parseAndType(testCode);
		
		// Both should have the same structure but potentially different variable names
		expect(result.type.kind).toBe('function');
	});

	test('simplified reproduction of the bug', () => {
		// Minimal reproduction
		const testCode = `
			f1 = fn x => Ok 1;
			f2 = fn x => Ok 2; 
			result1 = f1 |> map_err (fn e => e);
			result2 = f2 |> map_err (fn e => e);
			result2
		`;

		// This currently fails with type variable sharing
		expect(() => parseAndType(testCode)).not.toThrow();
	});
});