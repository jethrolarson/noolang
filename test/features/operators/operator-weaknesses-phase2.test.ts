import { test, describe } from 'bun:test';
import { expectSuccess } from '../../utils';

// =============================================================================
// OPERATOR FUNCTIONALITY TESTS
// =============================================================================
describe('Operator Functionality', () => {
	test('| operator with constraint resolution in pipeline', () => {
		expectSuccess(`[1, 2, 3] | list_map show`, ['1', '2', '3']);
	});

	// |? operator now works with all monads through the trait system
	test('|? operator with Result type - safe thrush for monads', () => {
		expectSuccess(
			`
        result = Ok 5 |? (fn x => x * 2);
        match result with (Ok x => x; Err _ => 0)
    `,
			10
		);
	});

	// |> is broken
	test.skip('complex operator precedence with multiple operators', () => {
		expectSuccess(
			`
        f = fn x => x * 2;
        g = fn x => x + 1;
        result = [1, 2, 3] | list_map $ f |> list_map $ g;
        result
    `,
			[3, 5, 7]
		);
	});

	test('constraint propagation through $ operator', () => {
		expectSuccess(
			`
      showAndConcat = fn x => concat "Value: " $ show x;
      showAndConcat 42
      `,
			'Value: 42'
		);
	});

	test('operators with ADT pattern matching', () => {
		expectSuccess(
			`
        variant Point a = Point a a;
        getX = fn point => match point with (Point x y => x);
        points = [Point 1 2, Point 3 4];
        result = points | list_map $ getX;
        result
    `,
			[1, 3]
		);
	});

	test('type inference with nested operator applications', () => {
		expectSuccess(
			`
        compose = fn f g => fn x => f $ g x;
        sum1 = fn x => x + 1;
        mul2 = fn x => x * 2;
        combined = compose sum1 mul2;
        result = [1, 2, 3] | list_map $ combined;
        result
    `,
			[3, 5, 7]
		);
	});

	test('operators with mutable variables', () => {
		expectSuccess(
			`
        mut counter = 0;
        increment = fn x => (mut! counter = counter + 1; x + counter);
        result = [1, 2, 3] | (list_map increment);
        {result, counter} : {List Float, Float}
      `,
			[[2, 4, 6], 3]
		);
	});

	test('operators with record accessor chains', () => {
		expectSuccess(
			`
        person = { @address { @street "123 Main", @city "NYC" } };
        getCity = fn p => p | @address | @city;
        result = getCity $ person;
        result
    `,
			'NYC'
		);
	});

	test('polymorphic identity function with operators', () => {
		expectSuccess(
			`
        result1 = id 42;
        result2 = id "hello";
        {result1, result2} : {Float, String}
    `,
			[42, 'hello']
		);
	});

	test('operator chaining with different types', () => {
		expectSuccess(
			`
        double = fn x => x * 2;
        toString = fn x => concat "Value: " $ show x;
        result = 5 | double | toString;
        result
    `,
			'Value: 10'
		);
	});

	// Fixed: safeDivide corrected to not double-wrap since / already returns Option
	test('safe thrush with Option type', () => {
		expectSuccess(
			`
        safeDivide = fn x y => if y == 0 then None else (x / y);
        result = Some 10 |? (fn x => safeDivide x 2);
        match result with (Some x => x; None => 0)
    `,
			5
		);
	});

	test('operator precedence with parentheses', () => {
		expectSuccess(
			`
        f = fn x => x + 1;
        g = fn x => x * 2;
        (f <| g) 5
    `,
			11
		);
	});

	test('list operations with operator chaining', () => {
		expectSuccess(
			`
        numbers = [1, 2, 3, 4, 5];
        result = numbers | list_filter $ (fn x => x > 2) | list_map $ (fn x => x * 2);
        result
    `,
			[6, 8, 10]
		);
	});
});
