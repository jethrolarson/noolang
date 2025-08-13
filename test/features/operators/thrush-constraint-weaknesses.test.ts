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
        match result (Some x => x; None => 0)
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
        extract = fn opt => match opt (Some x => x; None => 0);
        result = opts | list_map extract;
        result
    `,
		[1, 0, 3]
	);
});

// New coverage: number piped into partially-applied add
test('simple value thrush with partially applied add', () => {
	expectSuccess(`1 | add 1`, 2);
});

// New coverage: list into map (add 1) then head
test('chained thrush with trait partial and head', () => {
	expectSuccess(
		`
      tmp = [1, 2, 3] | list_map (add 1) | head;
      match tmp (Some x => x; None => 0)
    `,
		2
	);
});

// New coverage: strings with Add String implementation
test('| with trait add on strings through map', () => {
	expectSuccess(
		`
      ["a", "b"] | map (add "x")
    `,
		['xa', 'xb']
	);
});

// =============================================================================
// WEAKNESS INVESTIGATION: OPERATOR CHAINING EDGE CASES
// =============================================================================

test('multiple | operators in chain', () => {
	expectSuccess(
		`
        result = [1, 2, 3, 4, 5] 
            | list_filter (fn x => x > 2) 
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

// New coverage: wrong typed partial application through map
test('type error when partially applying add with wrong type', () => {
	expectError(`[1, 2, 3] | map (add "x")`, 'requires two strings');
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

test('| operator with trait and built-in partially applied functions (add)', () => {
	expectSuccess(
		`
      [1, 2, 3] | map (add 1)
    `,
		[2, 3, 4]
	);
});
