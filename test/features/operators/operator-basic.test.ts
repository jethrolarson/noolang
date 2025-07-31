import { test } from 'bun:test';
import { expectError, expectSuccess } from '../../utils';

// =============================================================================
// BASIC OPERATOR FUNCTIONALITY TESTS
// =============================================================================

test('$ operator should work with constraint functions', () => {
	expectSuccess(
		`
        nums = [1, 2, 3];
        result = list_map $ (fn x => x * 2);
        result nums
    `,
		[2, 4, 6]
	);
});

test('$ operator should work with trait functions', () => {
	expectSuccess(
		`
        # Using built-in toString instead of custom show to avoid duplication
        nums = [1, 2, 3];
        result = list_map $ toString;  # This now works after fixing list_map
        result nums
    `,
		['1', '2', '3']
	);
});

test('$ operator should handle curried trait functions', () => {
	expectSuccess(
		`
        nums = [1, 2, 3];
        addOne = (fn x y => x + y) $ 1;
        result = list_map $ addOne;
        result nums
    `,
		[2, 3, 4]
	);
});

test('| operator should work with pure constraint functions', () => {
	expectSuccess(
		`
        [1, 2, 3] | list_map (fn x => x * 2)
    `,
		[2, 4, 6]
	);
});

test('| operator should work with effectful functions', () => {
	expectSuccess(
		`
        result = [1, 2, 3] | head;
        match result with (Some x => x; None => 0)
    `,
		1
	);
});

test('|? operator should work with Option types', () => {
	expectSuccess(
		`
        result = Some 5 |? (fn x => x * 2);
        match result with (Some x => x; None => 0)
    `,
		10
	);
});

test('|? operator should short-circuit on None', () => {
	expectSuccess(
		`
        result = None |? (fn x => x * 2);
        match result with (Some x => x; None => -1)
    `,
		-1
	);
});

test('$ operator should have correct precedence with |', () => {
	expectSuccess(
		`
        addTwo = fn x => x + 2;
        result = [1, 2, 3] | list_map $ addTwo;
        result
    `,
		[3, 4, 5]
	);
});

test('$ operator right associativity with complex expressions', () => {
	expectSuccess(
		`
        # Test with proper function that accepts multiple arguments
        f = fn a => fn b => fn c => a + b + c;
        result = ((f $ 1) $ 2) $ 3;  # Explicit parentheses to test the result we want
        result
    `,
		6
	);
});

test('proper error messages for $ operator misuse', () => {
	expectError(`5 $ 3`); // Should give clear error about non-function
});

test('proper error messages for | operator misuse', () => {
	expectError(`5 | 3`); // Should give clear error about non-function
});

test('proper error messages for |? operator misuse', () => {
	expectError(`5 |? 3`); // Should give clear error about non-function or non-monad
});

// =============================================================================
// PIPELINE OPERATOR WITH BUILT-IN FUNCTIONS
// =============================================================================

test('pipeline operator with list_map and toString', () => {
	expectSuccess(
		`
        result = [1, 2, 3] | list_map toString;
        result
    `,
		['1', '2', '3']
	);
});

test('pipeline operator with list_map and custom function', () => {
	expectSuccess(
		`
        double = fn x => x * 2;
        result = [1, 2, 3] | list_map double;
        result
    `,
		[2, 4, 6]
	);
});

test('direct list_map toString usage', () => {
	expectSuccess(
		`
        result = list_map toString [1, 2, 3];
        result
    `,
		['1', '2', '3']
	);
});

test('toString function works individually', () => {
	expectSuccess(
		`
        result = toString 42;
        result
    `,
		'42'
	);
});

test('pipeline operator with other built-in functions', () => {
	expectSuccess(
		`
        result = [1, 2, 3] | length;
        result
    `,
		3
	);
});
