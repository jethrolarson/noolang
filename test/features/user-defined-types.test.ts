import { runCode, expectSuccess } from '../utils';

describe('User-Defined Types', () => {
	describe('Record Types', () => {
		test('should define simple record type', () => {
			expectSuccess(
				`type User = record {@name String, @age Float}`,
				{ tag: "unit" }
			);
		});

		test('should define empty record type', () => {
			expectSuccess(
				`type Empty = record {}`,
				{ tag: "unit" }
			);
		});

		test('should define record type with single field', () => {
			expectSuccess(
				`type SingleField = record {@value Float}`,
				{ tag: "unit" }
			);
		});

		test('should define record type with multiple fields', () => {
			expectSuccess(
				`type Person = record {@name String, @age Float, @active Bool}`,
				{ tag: "unit" }
			);
		});

		test('should define parameterized record type', () => {
			expectSuccess(
				`type Container a = record {@value a, @count Float}`,
				{ tag: "unit" }
			);
		});
	});

	describe('Tuple Types', () => {
		test('should define simple tuple type', () => {
			expectSuccess(
				`type Point = tuple {Float, Float}`,
				{ tag: "unit" }
			);
		});

		test('should define empty tuple type', () => {
			expectSuccess(
				`type Empty = tuple {}`,
				{ tag: "unit" }
			);
		});

		test('should define single element tuple type', () => {
			expectSuccess(
				`type SingleElement = tuple {String}`,
				{ tag: "unit" }
			);
		});

		test('should define tuple type with multiple elements', () => {
			expectSuccess(
				`type Coordinates = tuple {Float, Float, Float, String}`,
				{ tag: "unit" }
			);
		});

		test('should define parameterized tuple type', () => {
			expectSuccess(
				`type Pair a b = tuple {a, b}`,
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
	});

	describe('Complex Combinations', () => {
		test('should define multiple user-defined types', () => {
			expectSuccess(`
				type User = record {@name String, @age Float};
				type Point = tuple {Float, Float};
				type Response = String | Float;
				"all types defined"
			`, "all types defined");
		});

		test('should mix user-defined types with variants', () => {
			expectSuccess(`
				variant Color = Red | Green | Blue;
				type User = record {@name String};
				"mixed successfully"
			`, "mixed successfully");
		});

		test('should handle nested type definitions', () => {
			expectSuccess(`
				type User = record {@name String, @age Float};
				"nested types defined"
			`, "nested types defined");
		});
	});

	describe('Type Parameters', () => {
		test('should handle single type parameter', () => {
			expectSuccess(
				`type Container a = record {@value a}`,
				{ tag: "unit" }
			);
		});

		test('should handle multiple type parameters', () => {
			expectSuccess(
				`type Triple a b c = tuple {a, b, c}`,
				{ tag: "unit" }
			);
		});

		test('should handle type parameters in unions', () => {
			expectSuccess(
				`type Either a b = a | b`,
				{ tag: "unit" }
			);
		});
	});

	describe('Basic Functionality', () => {
		test('should handle whitespace variations', () => {
			expectSuccess(
				`type   Spaced   =   record   {   @name   String   }`,
				{ tag: "unit" }
			);
		});
	});
});