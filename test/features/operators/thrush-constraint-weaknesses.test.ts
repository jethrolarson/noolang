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

// Test constraint propagation through | operator
test.skip('| operator with constraint propagation (might fail)', () => {
	// This tests if constraints properly propagate through the | operator
	expectError(
		`
        constraint Show a ( show : a -> String );
        implement Show Float ( show = toString );
        
        # Test if Show constraint propagates properly
        showList = fn list => list | list_map show | toString;
        result = showList [1, 2, 3];
        result
    `,
		'constraint'
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

test.skip('| operator with mixed effects and constraints (might fail)', () => {
	// This tests a complex case with both effects and constraints
	expectError(
		`
        constraint Show a ( show : a -> String );
        implement Show Float ( show = toString );
        
        printAndShow = fn x => (print (show x); x);
        result = [1, 2, 3] | list_map printAndShow;
        result
    `,
		'effect|constraint'
	);
});

// =============================================================================
// WEAKNESS INVESTIGATION: CONSTRAINT SYSTEM EDGE CASES
// =============================================================================

test.skip('nested constraint resolution with operators (might fail)', () => {
	expectError(
		`
        constraint Eq a ( equals : a -> a -> Bool );
        implement Eq Float ( equals = fn a b => a == b );
        
        findAndFilter = fn target list => 
            list | filter (fn x => equals x target) | head;
            
        result = findAndFilter 2 [1, 2, 3, 2];
        match result with (Some x => x; None => 0)
    `,
		'constraint|type'
	);
});

test('operator precedence with constraints', () => {
	expectSuccess(
		`
        # Test that operator precedence works with constraint functions
        result = [1, 2, 3] | list_map (fn x => x + 1) | length;
        result
    `,
		3
	);
});

// =============================================================================
// WEAKNESS INVESTIGATION: ADT INTEGRATION WITH OPERATORS
// =============================================================================

test.skip('| operator with ADT pattern matching (might fail)', () => {
	expectError(
		`
        type Point a = Point a a;
        
        getX = fn point => match point with (Point x y => x);
        points = [Point 1 2, Point 3 4];
        result = points | list_map getX;
        result
    `,
		'pattern|constructor'
	);
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

test.skip('complex operator mixing (might fail)', () => {
	expectError(
		`
        # Test mixing |, $, and |> operators
        double = fn x => x * 2;
        isEven = fn x => (x % 2) == 0;
        
        result = [1, 2, 3, 4, 5] 
            | list_map $ double 
            | filter $ isEven 
            |> length;
        result
    `,
		'precedence|operator'
	);
});

// =============================================================================
// WEAKNESS INVESTIGATION: TYPE INFERENCE WITH OPERATORS
// =============================================================================

test.skip('polymorphic type inference with | operator (might fail)', () => {
	expectError(
		`
        # Test if type inference handles polymorphic functions correctly
        identity = fn x => x;
        
        nums = [1, 2, 3] | list_map identity;
        strs = ["a", "b", "c"] | list_map identity;
        
        [nums, strs]
    `,
		'type|inference'
	);
});

test('type inference with monomorphic functions', () => {
	expectSuccess(
		`
        double = fn x => x * 2;
        result = [1, 2, 3] | list_map double;
        result
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

test.skip('| operator with trait functions (might fail)', () => {
	expectError(
		`
        constraint Show a ( show : a -> String );
        implement Show Float ( show = toString );
        implement Show String ( show = fn s => s );
        
        # Test trait function dispatch through | operator
        values = [1, "hello", 3];
        result = values | list_map show;
        result
    `,
		'trait|dispatch'
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
