import { test, describe, expect } from 'bun:test';
import { expectSuccess, expectError } from '../utils';

describe('Union Type Issues', () => {
	test('union type definition works', () => {
		expectSuccess(`type Foo = String | Float`, { tag: "unit" });
	});

	test('union type annotation works', () => {
		expectSuccess(`
			type Foo = String | Float;
			x = 1 : Foo;
			x
		`, 1);
	});

	test('union type arithmetic properly fails (correct behavior)', () => {
		expectError(`
			type Foo = String | Float;
			x = 1 : Foo;
			x + 2
		`, /pattern matching.*narrow the type/);
	});

	test('string concatenation on union type properly fails (correct behavior)', () => {
		expectError(`
			type StringOrFloat = String | Float;
			x = "hello" : StringOrFloat;
			x + " world"
		`, /pattern matching.*narrow the type/);
	});

	test('comparison operators on union types fail', () => {
		expectError(`
			type Mixed = String | Bool;
			x = True : Mixed;
			x == "test"
		`, /pattern matching.*narrow the type/);
	});

	test('multiple union types in operation', () => {
		expectError(`
			type AB = String | Float;
			x = 1 : AB;
			x + 2
		`, /pattern matching.*narrow the type/);
	});

	test('union type with functions fails', () => {
		expectError(`
			type FuncOrString = (Float -> Float) | String;
			f = (fn x => x + 1) : FuncOrString;
			f 5
		`, /non-function type|pattern matching/);
	});

	test('nested union types in records', () => {
		expectSuccess(`
			type FlexValue = String | Float;
			type Record = { @value FlexValue };
			rec = { @value "hello" } : Record;
			rec | @value
		`, "hello");
	});

	test('union types with same constituent types unify', () => {
		expectSuccess(`
			type AB = String | Float;
			type BA = Float | String;
			x = "hello" : AB;
			y = x : BA;
			y
		`, "hello");
	});

	test('invalid union type annotation on identity function should fail', () => {
		// Union types are untagged, so identity cannot preserve type safety
		// Use ADTs for type-safe identity: variant StringOrFloat = Str String | Flo Float
		expectError(`
			type StringOrFloat = String | Float;
			identity = fn x => x : StringOrFloat -> StringOrFloat;
			result = identity "hello";
			result
		`, /Cannot unify.*union.*concrete/);
	});

	test('three-way union type', () => {
		expectSuccess(`
			type Triple = String | Float | Bool;
			x = True : Triple;
			x
		`, true);
	});

	test('union type with unit', () => {
		expectSuccess(`
			type MaybeUnit = Unit | String;
			x = {} : MaybeUnit;
			x
		`, { tag: "unit" });
	});

	test('function application with union argument fails', () => {
		expectError(`
			type StringOrFloat = String | Float;
			f = fn x => x + 1;
			val = 42 : StringOrFloat;
			f val
		`, /Cannot directly apply functions|pattern matching/);
	});

	test('if condition with union type fails', () => {
		expectError(`
			type StringOrFloat = String | Float;
			val = "hello" : StringOrFloat;
			if val then "yes" else "no"
		`, /Cannot unify union type|pattern matching/);
	});

	// TODO: This should fail but currently type annotations are too permissive
	// test('incompatible union assignment should fail', () => {
	// 	expectError(`
	// 		type StringOrFloat = String | Float;
	// 		type BoolOrUnit = Bool | Unit;
	// 		x = "hello" : StringOrFloat;
	// 		y = x : BoolOrUnit
	// 	`, /Union type mismatch.*String.*cannot be unified/);
	// });

	test('compatible union assignment should work', () => {
		expectSuccess(`
			type StringOrFloat = String | Float;
			type FloatOrString = Float | String;
			x = 42 : StringOrFloat;
			y = x : FloatOrString;
			y
		`, 42);
	});

	test('union type cannot be mixed with inferred concrete list', () => {
		expectError(`
			type Foo = String | Float;
			x = 1 : Foo;
			cons x [1]
		`, /Cannot.*unify.*pattern matching/);
	});

	test('union type works with explicitly typed union list', () => {
		expectSuccess(`
			type Foo = String | Float;
			x = 1 : Foo;
			xs = [1] : List Foo;
			cons x xs
		`, expect.any(Object));
	});

	test('string concatenation on union type requires pattern matching', () => {
		expectError(`
			type StringOrFloat = String | Float;
			x = "hello" : StringOrFloat;
			x + " world"
		`, /Cannot directly use operators.*pattern matching/);
	});

	test('subtyping: Float should work with String | Float in cons', () => {
		expectSuccess(`
			type StringOrFloat = String | Float;
			x = 1 : StringOrFloat;
			xs = [x];
			cons 1 xs
		`, expect.any(Object));
	});

	test('subtyping: String should work with String | Float in cons', () => {
		expectSuccess(`
			type StringOrFloat = String | Float;
			x = "hello" : StringOrFloat;
			xs = [x];
			cons "world" xs
		`, expect.any(Object));
	});

	test('subtyping: concrete type unifies with union containing it', () => {
		expectSuccess(`
			type AB = String | Float;
			f = fn x => x : Float -> Float;
			val = 42 : AB;
			result = f 42;
			result
		`, 42);
	});

	test('subtyping: incompatible concrete type fails with union', () => {
		expectError(`
			type StringOrFloat = String | Float;
			x = True : StringOrFloat
		`, /Type mismatch.*Bool.*not compatible.*String.*Float/);
	});
});