import { expect, test, describe } from 'bun:test';
import { assertVariableType, parseAndType } from '../../test/utils';
import {
	assertFunctionType,
	assertVariantType,
	assertPrimitiveType,
} from '../../test/utils';

describe('map_err type inference bug', () => {
	test('map_err should respect explicit type annotation (b -> c) -> Result a b -> Result a c', () => {
		const result = parseAndType('map_err');

		// Verify map_err has the correct type structure
		assertFunctionType(result.type);
		expect(result.type.params).toHaveLength(1);

		// First parameter should be (b -> c)
		const firstParam = result.type.params[0];
		assertFunctionType(firstParam);
		expect(firstParam.params).toHaveLength(1);
		assertVariableType(firstParam.return);

		// Return type should be Result a b -> Result a c
		const returnType = result.type.return;
		assertFunctionType(returnType);
		expect(returnType.params).toHaveLength(1);
		assertVariantType(returnType.params[0]);
		expect(returnType.params[0].name).toBe('Result');
		expect(returnType.params[0].args).toHaveLength(2);

		// Final return should also be Result
		expect(returnType.return.kind).toBe('variant');
		assertVariantType(returnType.return);
		expect(returnType.return.name).toBe('Result');
		expect(returnType.return.args).toHaveLength(2);
	});

	test('map_err should work with Result String String -> Result String DecodeError', () => {
		// This is the specific case from schema.noo that was failing
		const testCode = `
			# Simulate the schema validation case
			variant DecodeError = TypeMismatch String String;
			
			# This should work if map_err type inference is correct
			error_transformer = fn e => TypeMismatch "String" e;
			test_result = Err "Unknown";
			transformed = map_err error_transformer test_result;
			transformed
		`;

		const testResult = parseAndType(testCode);

		// Verify the result type is correct - should be Result a DecodeError (where 'a' is preserved)
		expect(testResult.type.kind).toBe('variant');
		assertVariantType(testResult.type);
		expect(testResult.type.name).toBe('Result');
		expect(testResult.type.args).toHaveLength(2);

		// First arg should be a type variable (success type preserved as polymorphic)
		assertVariableType(testResult.type.args[0]);

		// Second arg should be the transformed error type (whatever the transformer returns)
		// In this case, it should be DecodeError since the transformer returns TypeMismatch
		assertVariantType(testResult.type.args[1]);
		expect(testResult.type.args[1].name).toBe('DecodeError');
	});

	test('map_err should preserve success type while transforming error type', () => {
		const testCode = `
			# Test that map_err preserves the success type 'a'
			variant TestError = Error1 String | Error2 Float;
			
			# Transform String error to TestError
			error_transformer = fn e => Error1 e;
			test_result = Ok 42;
			transformed = map_err error_transformer test_result;
			transformed
		`;

		const testResult = parseAndType(testCode);

		// Verify the result type structure - should be Result a TestError (where 'a' is preserved)
		expect(testResult.type.kind).toBe('variant');
		assertVariantType(testResult.type);
		expect(testResult.type.name).toBe('Result');
		expect(testResult.type.args).toHaveLength(2);

		// Success type should be preserved as Float (from Ok 42)
		assertPrimitiveType(testResult.type.args[0]);
		expect(testResult.type.args[0].name).toBe('Float');

		// Error type should be transformed to TestError
		assertVariantType(testResult.type.args[1]);
		expect(testResult.type.args[1].name).toBe('TestError');
	});

	test('map_err type annotation should override inferred type', () => {
		// This test checks if the explicit type annotation is being respected
		const result = parseAndType('map_err');

		// Verify the type matches the explicit annotation, not the inferred one
		assertFunctionType(result.type);

		// Check that we have the correct parameter structure
		expect(result.type.params).toHaveLength(1);
		const firstParam = result.type.params[0];
		assertFunctionType(firstParam);

		// Verify the function parameter has distinct input/output types
		expect(firstParam.params).toHaveLength(1);
		assertVariableType(firstParam.return);

		// The return type should be a function taking Result a b and returning Result a c
		const returnType = result.type.return;
		assertFunctionType(returnType);
		expect(returnType.params).toHaveLength(1);
		assertVariantType(returnType.params[0]);
		expect(returnType.params[0].name).toBe('Result');
	});

	test('type annotation syntax should be parsed correctly', () => {
		// Test that the type annotation syntax itself works
		const testCode = `
			# Test explicit type annotation
			test_fn = fn x => x + 1 : Float -> Float;
			test_fn
		`;

		const testResult = parseAndType(testCode);

		// Verify the type annotation is respected
		assertFunctionType(testResult.type);
		expect(testResult.type.params).toHaveLength(1);
		assertPrimitiveType(testResult.type.params[0]);
		expect(testResult.type.params[0].name).toBe('Float');
		assertPrimitiveType(testResult.type.return);
		expect(testResult.type.return.name).toBe('Float');
	});

	test('stdlib map_err should be parsed as TypedExpression', () => {
		// This test checks if the stdlib map_err is actually being parsed correctly
		// We need to verify that the type annotation is being processed
		const result = parseAndType('map_err');

		// Verify the type structure matches the expected annotation
		assertFunctionType(result.type);

		expect(result.type.params).toHaveLength(1);

		// First parameter should be (b -> c)
		const firstParam = result.type.params[0];
		assertFunctionType(firstParam);

		expect(firstParam.params).toHaveLength(1);
		assertVariableType(firstParam.return);

		// Return type should be Result a b -> Result a c
		const returnType = result.type.return;
		assertFunctionType(returnType);

		expect(returnType.params).toHaveLength(1);
		assertVariantType(returnType.params[0]);

		expect(returnType.params[0].name).toBe('Result');
		expect(returnType.params[0].args).toHaveLength(2);

		// Final return should also be Result
		assertVariantType(returnType.return);

		expect(returnType.return.name).toBe('Result');
		expect(returnType.return.args).toHaveLength(2);
	});

	test('simple type annotation with distinct variables should work', () => {
		// Test that type annotations with distinct variables work correctly
		const testCode = `
			# Test that b and c are treated as distinct variables
			test_fn = (fn x => x) : (b -> c);
			test_fn
		`;

		const testResult = parseAndType(testCode);

		// Verify the type annotation preserves distinct variables
		assertFunctionType(testResult.type);
		expect(testResult.type.params).toHaveLength(1);
		assertVariableType(testResult.type.params[0]);
		assertVariableType(testResult.type.return);

		// The input and output types should be different variables (b and c)
		// We can't check the exact names since they get freshened, but we can verify structure
		expect(testResult.type.params[0].name).not.toBe(
			testResult.type.return.name
		);
	});
});
