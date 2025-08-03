import { test } from 'bun:test';
import { expectError, expectSuccess } from '../../utils';

// =============================================================================
// WEAKNESS INVESTIGATION: | OPERATOR WITH CONSTRAINTS
// =============================================================================

test('| operator works with basic constraint functions', () => {
	expectSuccess(
		`
        [1, 2, 3] | list_map (fn x => x * 2)
    `,
		[2, 4, 6]
	);
});

test('| operator with built-in constraint resolution', () => {
	expectSuccess(
		`
        result = [1, 2, 3] | head;
        match result with (Some x => x; None => 0)
    `,
		1
	);
});

test('| operator with effectful functions', () => {
	// Test that effects can propagate through | operator
	expectSuccess(
		`
        printAndReturn = fn x => (print x; x);
        result = 42 | printAndReturn;
        result
    `,
		42
	);
});

test('operator precedence with constraints', () => {
	expectSuccess(`[1, 2, 3] | list_map (fn x => x + 1) | length`, 3);
});

test('| operator with built-in ADTs works', () => {
	expectSuccess(
		`
        opts = [Some 1, None, Some 3];
        extract = fn opt => match opt with (Some x => x; None => 0);
        result = opts | list_map extract;
        result
    `,
		[1, 0, 3]
	);
});

// =============================================================================
// WEAKNESS INVESTIGATION: OPERATOR CHAINING EDGE CASES
// =============================================================================

test('multiple | operators in chain', () => {
	expectSuccess(
		`
        result = [1, 2, 3, 4, 5] 
            | filter (fn x => x > 2) 
            | list_map (fn x => x * 2) 
            | length;
        result
    `,
		3
	);
});

test('type inference with monomorphic functions', () => {
	expectSuccess(
		`
        double = fn x => x * 2;
        [1, 2, 3] | list_map double
    `,
		[2, 4, 6]
	);
});

// =============================================================================
// WEAKNESS INVESTIGATION: ERROR HANDLING AND RECOVERY
// =============================================================================

test('| operator with non-function gives clear error', () => {
	expectError(`5 | 3`, 'non-function|function');
});

test('| operator with wrong argument type', () => {
	expectError(`"hello" | length`, 'type|argument');
});

// =============================================================================
// WEAKNESS INVESTIGATION: TRAIT FUNCTION INTEGRATION
// =============================================================================

// Need ability to have heterogenous List types
test.skip('| operator with trait functions', () => {
	expectSuccess(
		`
      values = [1, "hello", 3] : List (Float | String);
      values | list_map show;
    `,
		'TODO'
	);
});

test('| operator with built-in functions', () => {
	expectSuccess(
		`
        # This now works after fixing list_map to accept native functions
        result = [1, 2, 3] | list_map toString;
        result
    `,
		['1', '2', '3']
	);
});
