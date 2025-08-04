import { runCode, expectSuccess, parseAndType } from '../utils';

describe('User-Defined Types', () => {
	describe('Record Types', () => {
		test('should define simple record type', () => {
			expectSuccess(
				`type User = {@name String, @age Float}`,
				{ tag: "unit" }
			);
		});

		test('should define empty record type', () => {
			expectSuccess(
				`type Empty = {}`,
				{ tag: "unit" }
			);
		});

		test('should define record type with single field', () => {
			expectSuccess(
				`type SingleField = {@value Float}`,
				{ tag: "unit" }
			);
		});

		test('should define record type with multiple fields', () => {
			expectSuccess(
				`type Person = {@name String, @age Float, @active Bool}`,
				{ tag: "unit" }
			);
		});

		test('should define parameterized record type', () => {
			expectSuccess(
				`type Container a = {@value a, @count Float}`,
				{ tag: "unit" }
			);
		});
	});

	describe('Tuple Types', () => {
		test('should define simple tuple type', () => {
			expectSuccess(
				`type Point = {Float, Float}`,
				{ tag: "unit" }
			);
		});

		test('should define empty tuple type', () => {
			expectSuccess(
				`type Empty = {}`,
				{ tag: "unit" }
			);
		});

		test('should define single element tuple type', () => {
			expectSuccess(
				`type SingleElement = {String}`,
				{ tag: "unit" }
			);
		});

		test('should define tuple type with multiple elements', () => {
			expectSuccess(
				`type Coordinates = {Float, Float, Float, String}`,
				{ tag: "unit" }
			);
		});

		test('should define parameterized tuple type', () => {
			expectSuccess(
				`type Pair a b = {a, b}`,
				{ tag: "unit" }
			);
		});
	});

	describe('Union Types', () => {
		test('should define simple union type', () => {
			expectSuccess(
				`type StringOrFloat = String | Float`,
				{ tag: "unit" }
			);
		});

		test('should define union with multiple types', () => {
			expectSuccess(
				`type MultiUnion = String | Float | Bool`,
				{ tag: "unit" }
			);
		});

		test('should define parameterized union type', () => {
			expectSuccess(
				`type Either a b = a | b`,
				{ tag: "unit" }
			);
		});

		test('should define union with tuple and record', () => {
			expectSuccess(
				`type Mixed = String | {Float, String}`,
				{ tag: "unit" }
			);
		});
	});

	describe('Your Original Examples', () => {
		test('should support your first example', () => {
			expectSuccess(
				`type User = {@name String, @age Float}`,
				{ tag: "unit" }
			);
		});

		test('should support your second example', () => {
			expectSuccess(
				`type Foo = String | {Float, String}`,
				{ tag: "unit" }
			);
		});

		test('should support complex mixed types', () => {
			expectSuccess(
				`type Complex = String | {Float, Float}`,
				{ tag: "unit" }
			);
		});
	});

	describe('Complex Combinations', () => {
		test('should define multiple user-defined types', () => {
			expectSuccess(`
				type User = {@name String, @age Float};
				type Point = {Float, Float};
				type Response = String | Float;
				"all types defined"
			`, "all types defined");
		});

		test('should mix user-defined types with variants', () => {
			expectSuccess(`
				variant Color = Red | Green | Blue;
				type User = {@name String};
				"mixed successfully"
			`, "mixed successfully");
		});

		test('should handle complex nesting', () => {
			expectSuccess(`
				type UserRecord = {@name String, @age Float};
				type UserTuple = {String, Float};
				type Mixed = UserRecord | UserTuple | String;
				"complex nesting defined"
			`, "complex nesting defined");
		});
	});

	describe('Type Parameters', () => {
		test('should handle single type parameter', () => {
			expectSuccess(
				`type Container a = {@value a}`,
				{ tag: "unit" }
			);
		});

		test('should handle multiple type parameters', () => {
			expectSuccess(
				`type Triple a b c = {a, b, c}`,
				{ tag: "unit" }
			);
		});

		test('should handle type parameters in unions', () => {
			expectSuccess(
				`type Either a b = a | b`,
				{ tag: "unit" }
			);
		});

		test('should handle complex type parameter usage', () => {
			expectSuccess(
				`type Complex a b = {@left a, @right b}`,
				{ tag: "unit" }
			);
		});
	});

	describe('Basic Functionality', () => {
		test('should handle whitespace variations', () => {
			expectSuccess(
				`type   Spaced   =   {   @name   String   }`,
				{ tag: "unit" }
			);
		});

		test('should distinguish records from tuples correctly', () => {
			// Record - has @ accessors
			expectSuccess(
				`type UserRecord = {@name String, @age Float}`,
				{ tag: "unit" }
			);
			
			// Tuple - no @ accessors  
			expectSuccess(
				`type UserTuple = {String, Float}`,
				{ tag: "unit" }
			);
		});
	});
});

describe('Type Alias Functionality', () => {
    test('simple type alias should work for type annotations', () => {
        const code = `type Foo = String; x = "hello" : Foo; x`;
        expectSuccess(code, "hello");
    });

    test('record type alias should work for type annotations', () => {
        const code = `type User = {@name String, @age Float}; user = {@name "Alice", @age 30} : User; user | @name`;
        expectSuccess(code, "Alice");
    });

    test('tuple type alias should work for type annotations', () => {
        const code = `type Point = {Float, Float}; point = {10.5, 20.3} : Point; match point with ({x, y} => x)`;
        expectSuccess(code, 10.5);
    });
});