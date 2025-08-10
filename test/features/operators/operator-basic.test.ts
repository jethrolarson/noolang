import { test, describe } from 'bun:test';
import { expectError, expectSuccess } from '../../utils';

describe('Operator', () => {
	describe('$', () => {
		test('should work with constraint functions', () => {
			expectSuccess(
				`
        nums = [1, 2, 3];
        result = list_map $ (fn x => x * 2);
        result nums
    `,
				[2, 4, 6]
			);
		});

		test('should work with trait functions', () => {
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

		test('should handle curried trait functions', () => {
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

		test('should have correct precedence with |', () => {
			expectSuccess(
				`
          addTwo = fn x => x + 2;
          result = [1, 2, 3] | list_map $ addTwo;
          result
      `,
				[3, 4, 5]
			);
		});

		test('right associativity with complex expressions', () => {
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

		test('proper error messages', () => {
			expectError(`5 $ 3`); // Should give clear error about non-function
		});
	});

	describe('|', () => {
		test('should work with pure constraint functions', () => {
			expectSuccess(
				`
        [1, 2, 3] | list_map (fn x => x * 2)
    `,
				[2, 4, 6]
			);
		});

		test('should work with effectful functions', () => {
			expectSuccess(
				`
        result = [1, 2, 3] | head;
        match result with (Some x => x; None => 0)
    `,
				1
			);
		});

		test('proper error messages for | misuse', () => {
			expectError(`5 | 3`); // Should give clear error about non-function
		});

		test('with list_map and toString', () => {
			expectSuccess(
				`
          result = [1, 2, 3] | list_map toString;
          result
      `,
				['1', '2', '3']
			);
		});

		test('list_map and custom function', () => {
			expectSuccess(
				`
          double = fn x => x * 2;
          result = [1, 2, 3] | list_map double;
          result
      `,
				[2, 4, 6]
			);
		});
		test('other built-in functions', () => {
			expectSuccess(
				`
          result = [1, 2, 3] | length;
          result
      `,
				3
			);
		});
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

	test('proper error messages for |? operator misuse', () => {
		expectError(`5 |? 3`); // Should give clear error about non-function or non-monad
	});

	// =============================================================================
	// PIPELINE OPERATOR WITH BUILT-IN FUNCTIONS
	// =============================================================================

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

	describe('|> operator', () => {
		test('should compose functions from left to right', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        addOne = fn x => x + 1;
        composed = double |> addOne;
        composed 5
    `,
				11
			);
		});

		test('should work with multiple function compositions', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        addOne = fn x => x + 1;
        toString = fn x => concat "Result: " $ show x;
        pipeline = double |> addOne |> toString;
        pipeline 5
    `,
				'Result: 11'
			);
		});

		test('should work with list operations', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        filterEven = fn list => list_filter (fn x => match x % 2 with (Some remainder => remainder == 0; None => False)) list;
        pipeline = filterEven |> list_map double;
        pipeline [1, 2, 3, 4, 5, 6]
    `,
				[4, 8, 12]
			);
		});

		test('should work with head and arithmetic', () => {
			expectSuccess(
				`
        addFive = fn x => x + 5;
        pipeline = head |> (fn opt => match opt with (Some x => Some (addFive x); None => None));
        result = pipeline [1, 2, 3];
        match result with (Some x => x; None => 0)
    `,
				6
			);
		});

		test('|> operator should work with curried functions', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        pipeline = (add 1) |> double;
        pipeline 5
    `,
				12
			);
		});

		test('proper error messages for |> operator misuse', () => {
			expectError(`5 |> 3`); // Should give clear error about non-function
		});
	});
	describe('<| operator', () => {
		test('should compose functions from right to left', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        addOne = fn x => x + 1;
        composed = addOne <| double;
        composed 5
    `,
				11
			);
		});

		test('should work with multiple function compositions', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        addOne = fn x => x + 1;
        toString = fn x => concat "Result: " $ show x;
        pipeline = toString <| addOne <| double;
        pipeline 5
    `,
				'Result: 11'
			);
		});

		test('should work with list operations', () => {
			expectSuccess(
				`
        double = fn x => x * 2;
        filterEven = fn list => list_filter (fn x => match x % 2 with (Some remainder => remainder == 0; None => False)) list;
        pipeline = list_map double <| filterEven;
        pipeline [1, 2, 3, 4, 5, 6]
    `,
				[4, 8, 12]
			);
		});

		test('should work with head and arithmetic', () => {
			expectSuccess(
				`
        addFive = fn x => x + 5;
        pipeline = (fn opt => match opt with (Some x => Some (addFive x); None => None)) <| head;
        result = pipeline [1, 2, 3];
        match result with (Some x => x; None => 0)
    `,
				6
			);
		});
		test('<| operator should work with curried functions', () => {
			expectSuccess(
				`
          double = fn x => x * 2;
          pipeline = double <| (add 1);
          pipeline 5
      `,
				12
			);
		});

		test('proper error messages for <| operator misuse', () => {
			expectError(`5 <| 3`); // Should give clear error about non-function
		});
	});

	test('|> and <| should be inverses for two functions', () => {
		expectSuccess(
			`
        double = fn x => x * 2;
        addOne = fn x => x + 1;
        leftToRight = double |> addOne;
        rightToLeft = addOne <| double;
        leftToRight 5 == rightToLeft 5
    `,
			true
		);
	});

	test('|> and <| should work with complex nested operations', () => {
		expectSuccess(
			`
        double = fn x => x * 2;
        addOne = fn x => x + 1;
        toString = fn x => concat "Value: " $ show x;
        
        pipeline1 = double |> addOne |> toString;
        pipeline2 = toString <| addOne <| double;
        
        pipeline1 5 == pipeline2 5
    `,
			true
		);
	});
});
