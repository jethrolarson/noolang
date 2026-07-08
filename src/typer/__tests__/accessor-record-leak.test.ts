import { test, expect } from 'bun:test';
import { parseAndType, expectError } from '../../../test/utils';

// Regression tests for issue #103: "Required field missing" leaking across
// top-level statements.
//
// Root cause: typeAccessor cached accessor function types (accessorCache)
// INCLUDING their type variables. The first time an accessor like @name was
// applied, its cached record type variable was unified with (pinned to) that
// specific record type in the substitution. Every later use of the same
// accessor reused the exact same type variables, so applying @name to a
// DIFFERENT record shape unified the old record type against the new one and
// threw a spurious "Required field missing: <field>" error. Accessors must be
// polymorphic: each use site needs fresh type variables.

test('same accessor used on two differently-shaped records type-checks (#103 minimal)', () => {
	expect(() =>
		parseAndType(`
			u = { @name 1, @extra 2 };
			x = @name u;
			v = { @name 3 };
			y = @name v;
			y
		`)
	).not.toThrow();
});

test('accessor pinned by nested record does not leak into redefined record (#103)', () => {
	// Distilled from the failing region of the original report: `user` first
	// has a nested @address record, accessors are used (including composed
	// accessors), then `user` is redefined WITHOUT @address and accessed again.
	expect(() =>
		parseAndType(`
			user = { @name "Alice", @age 30, @address { @street "123 Main St", @city "Anytown" } };
			(@name user);
			user | @address | @street;
			user_street = @address |> @street;
			user_street user;
			user = { @name "Alice", @age 30, @active True };
			userName = user | @name;
			userName
		`)
	).not.toThrow();
});

test('full accumulated program from issue #103 type-checks', () => {
	const program = `
# Records
user = { @name "Alice", @age 30, @address { @street "123 Main St", @city "Anytown" } };

# Accessors
(@name user);

# accessors can be chained
user | @address | @street;

# accessors can also be composed
user_street = @address |> @street;
user_street user;

# Destructuring for clean data extraction
{x, y} = {10, 20};
x + y;
{@name, @age} = {@name "Alice", @age 30};
name;

# Recursion
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));

# Mutation
mut counter = 0;
mut! counter = counter + 1;

# Variant Types (ADTs)
variant Color = Red | Green | Blue;
favorite = Red;

Some 1;
None;

result = match (Some 42) (Some x => x; None => 0);

# Recursive variants (Binary Tree)
variant Tree a = Node a (Tree a) (Tree a) | Leaf;
tree = Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf);
sum = fn t => match t (
    Node value left right => value + (sum left) + (sum right);
    Leaf => 0
);
tree_sum = sum tree;

# User-Defined Types
type User = {@name String, @age Float, @active Bool};
type Point = {Float, Float};
type Response = User | String | Float;

user = {@name "Alice", @age 30, @active True};
point = {10.5, 20.3};

userName = user | @name;
	`;
	expect(() => parseAndType(program)).not.toThrow();
});

test('real missing-field errors are still reported', () => {
	// Guard against over-fixing: accessing a field that genuinely does not
	// exist on a record must still fail.
	expectError(
		'v = { @name 3 }; y = @extra v; y',
		/extra/
	);
});
