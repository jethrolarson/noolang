import { test, expect, describe } from 'bun:test';

// Helper function to parse and evaluate Noolang code
import { runCode } from '../utils';
describe('Algebraic Data Types', () => {
	describe('Option Type', () => {
		test('should create Some values', () => {
			const result = runCode(`Some 42`);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'Some',
				args: [{ tag: 'number', value: 42 }],
			});
		});

		test('should create None values', () => {
			const result = runCode(`None`);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'None',
				args: [],
			});
		});

		test('should pattern match on Some', () => {
			const result = runCode(`
		opt = Some 42;
		match opt with (
			Some x => x;
			None => 0
		)
	`);

			expect(result.finalValue).toEqual(42);
		});

		test('should pattern match on None', () => {
			const result = runCode(`
		opt = None;
		match opt with (
			Some x => x;
			None => 0
		)
	`);

			expect(result.finalValue).toEqual(0);
		});

		test('should handle nested Some values', () => {
			const result = runCode(`
		nested = Some (Some 42);
		match nested with (
			Some (Some x) => x;
			Some None => -1;
			None => 0
		)
	`);

			expect(result.finalValue).toEqual(42);
		});
	});

	test('Custom ADT Definition - should define simple ADT', () => {
		const result = runCode(`
		type Color = Red | Green | Blue;
		Red
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Red',
			args: [],
		});
	});

	test('Custom ADT Definition - should pattern match on custom ADT', () => {
		const result = runCode(`
		type Color = Red | Green | Blue;
		
		colorToString = fn color => match color with (
			Red => "red";
			Green => "green";
			Blue => "blue"
		);
		
		colorToString Red
	`);

		expect(result.finalValue).toEqual('red');
	});

	test('Custom ADT Definition - should define ADT with parameters', () => {
		const result = runCode(`
		type Box a = Empty | Full a;
		Full 42
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Full',
			args: [{ tag: 'number', value: 42 }],
		});
	});

	test('Custom ADT Definition - should handle ADT with single parameter', () => {
		const result = runCode(`
		type Wrapper = Wrap Float;
		Wrap 42
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Wrap',
			args: [{ tag: 'number', value: 42 }],
		});
	});

	test.skip('should not allow shadowing built in types', () => {
		expect(() =>
			runCode(`
		type List a = Cons a (List a) | Nil;
	`)
		).toThrow('Shadowing built in type List');
	});

	test('Pattern Matching - should handle recursive ADTs', () => {
		const result = runCode(`
		type Lyst a = Cons a (Lyst a) | Nil;
		Cons 1 (Cons 2 Nil);
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Cons',
			args: [
				{ tag: 'number', value: 1 },
				{
					tag: 'constructor',
					name: 'Cons',
					args: [
						{ tag: 'number', value: 2 },
						{ tag: 'constructor', name: 'Nil', args: [] },
					],
				},
			],
		});
	});

	test('Pattern Matching - should handle complex pattern matching with variables', () => {
		const result = runCode(`
		type Result a b = Ok a | Error b;
		
		unwrap = fn result => match result with (
			Ok value => value;
			Error msg => 0
		);
		
		unwrap (Ok 42)
	`);

		expect(result.finalValue).toEqual(42);
	});

	test('Pattern Matching - should match on ADT with multiple parameters', () => {
		const result = runCode(`
		type Point = Point Float Float;
		
		getX = fn point => match point with (
			Point x y => x
		);
		
		getX (Point 3 4)
	`);

		expect(result.finalValue).toEqual(3);
	});

	test('Pattern Matching - should handle nested pattern matching', () => {
		const result = runCode(`
		type Inner = InnerValue Float;
		type Outer = OuterValue Inner;
		
		getValue = fn outer => match outer with (
			OuterValue inner => match inner with (
				InnerValue value => value
			)
		);
		
		getValue (OuterValue (InnerValue 42))
	`);

		expect(result.finalValue).toEqual(42);
	});

	test('Type Inference - should infer ADT types correctly', () => {
		const result = runCode(`
		type Maybe a = Just a | Nothing;
		Just 42
	`);

		expect(result.finalType).toBe('Maybe Float');
		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Just',
			args: [{ tag: 'number', value: 42 }],
		});
	});

	test('Type Inference - should handle polymorphic ADTs', () => {
		const result = runCode(`
		type Container a = Container a;
		
		makeContainer = fn value => Container value;
		
		stringContainer = makeContainer "hello";
		numberContainer = makeContainer 42;
		
		stringContainer
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Container',
			args: [{ tag: 'string', value: 'hello' }],
		});
	});

	test('Function Integration - should work with functions that return ADTs', () => {
		const result = runCode(`
		type Status = Success | Failure;
		
		checkNumber = fn x => if x > 0 then Success else Failure;
		
		checkNumber 5
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Success',
			args: [],
		});
	});

	test('Function Integration - should work with functions that take ADTs as parameters', () => {
		const result = runCode(`
		type Status = Success | Failure;
		
		statusToNumber = fn status => match status with (
			Success => 1;
			Failure => 0
		);
		
		statusToNumber Success
	`);

		expect(result.finalValue).toEqual(1);
	});

	test('Function Integration - should work with list_map and ADTs', () => {
		const result = runCode(`
		type Status = Success | Failure;
		
		statusToNumber = fn status => match status with (
			Success => 1;
			Failure => 0
		);
		
		statuses = [Success, Failure, Success];
		list_map statusToNumber statuses
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'list',
			values: [
				{ tag: 'number', value: 1 },
				{ tag: 'number', value: 0 },
				{ tag: 'number', value: 1 },
			],
		});
	});

	test('Multiple ADTs - should handle multiple ADT definitions in the same program - TODO: Fix ADT pattern matching', () => {
		const result = runCode(`
		type Color = Red | Green | Blue;
		type Size = Small | Medium | Large;
		
		item = {Red, Small};
		item
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'tuple',
			values: [
				{ tag: 'constructor', name: 'Red', args: [] },
				{ tag: 'constructor', name: 'Small', args: [] },
			],
		});
	});

	test('Multiple ADTs - should handle pattern matching on different ADTs separately - TODO: Fix ADT pattern matching', () => {
		const result = runCode(`
		type Color = Red | Green | Blue;
		type Size = Small | Medium | Large;
		
		colorToString = fn color => match color with (Red => "red"; Green => "green"; Blue => "blue");
		sizeToString = fn size => match size with (Small => "small"; Medium => "medium"; Large => "large");
		
		colorToString Red
	`);

		expect(result.finalValue).toEqual('red');
	});

	test('Multiple ADTs - should now work with list_map and multiple ADTs (polymorphism fixed)', () => {
		const result = runCode(`
		type Color = Red | Green | Blue;
		type Status = Success | Failure;
		
		colorToStatus = fn color => match color with (
			Red => Failure;
			Green => Success;
			Blue => Failure
		);
		
		colors = [Red, Green, Blue];
		list_map colorToStatus colors
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'list',
			values: [
				{ tag: 'constructor', name: 'Failure', args: [] },
				{ tag: 'constructor', name: 'Success', args: [] },
				{ tag: 'constructor', name: 'Failure', args: [] },
			],
		});
	});

	test('Edge Cases - should handle ADT constructors with no parameters - TODO: Fix parser for types with same name as constructor', () => {
		const result = runCode(`
		type U = U;
		U
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'U',
			args: [],
		});
	});

	test('Edge Cases - should handle ADT with same name as constructor - TODO: Fix parser for types with same name as constructor', () => {
		const result = runCode(`
		type U = U;
		
		isU = fn x => match x with (
			U => True
		);
		
		isU U
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'True',
			args: [],
		});
	});

	test.skip('Complex Scenarios - should work when shapes are processed separately', () => {
		const result = runCode(`
		type Color = Red | Green | Blue;
		type Shape a = Circle a | Rectangle a a | Triangle a a a;
		shapes = [Circle 3, Rectangle 5 4];
		calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
		areas = list_map calculate_area shapes;
		areas
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'list',
			values: [
				{ tag: 'number', value: 27 },
				{ tag: 'number', value: 20 },
			],
		});
	});

	test('Generic Constructors - should handle Point with generic parameters (issue fix)', () => {
		const result = runCode(`
		type Point a = Point a a;
		origin = Point 0.0 0.0;
		origin
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Point',
			args: [
				{ tag: 'number', value: 0.0 },
				{ tag: 'number', value: 0.0 },
			],
		});
	});

	test('Generic Constructors - should handle Shape with multiple constructors (issue fix)', () => {
		const result = runCode(`
		type Shape a = Circle a | Rectangle a a;
		circle = Circle 5.0;
		circle
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Circle',
			args: [{ tag: 'number', value: 5.0 }],
		});
	});

	test('Generic Constructors - should handle partial application of generic constructors', () => {
		const result = runCode(`
		type Point a = Point a a;
		makeOrigin = Point 0.0;
		point = makeOrigin 0.0;
		point
	`);

		expect(result.evalResult.finalResult).toEqual({
			tag: 'constructor',
			name: 'Point',
			args: [
				{ tag: 'number', value: 0.0 },
				{ tag: 'number', value: 0.0 },
			],
		});
	});

	// New Recursive ADT Tests
	test('Recursive ADT - Binary Tree construction and pattern matching', () => {
		const result = runCode(`
		type Tree a = Node a (Tree a) (Tree a) | Leaf;

		tree = Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf);

		getValue = fn t => match t with (
			Node value left right => value;
			Leaf => 0
		);

		getValue tree
	`);

		expect(result.evalResult.finalResult).toEqual({ tag: 'number', value: 5 });
	});

	test('Recursive ADT - LinkedList with pattern matching', () => {
		const result = runCode(`
		type LinkedList a = Cons a (LinkedList a) | Nil;

		sum = fn lst => match lst with (
			Cons h t => h + (sum t);
			Nil => 0
		);

		myList = Cons 1 (Cons 2 (Cons 3 Nil));
		sum myList
	`);

		expect(result.evalResult.finalResult).toEqual({ tag: 'number', value: 6 });
	});

	test('Recursive ADT - List operations with proper recursion', () => {
		const result = runCode(`
		type MyList a = Cons a (MyList a) | Nil;

		length = fn lst => match lst with (
			Cons h t => 1 + (length t);
			Nil => 0
		);

		lst = Cons "a" (Cons "b" (Cons "c" Nil));
		length lst
	`);

		expect(result.evalResult.finalResult).toEqual({ tag: 'number', value: 3 });
	});

	test('Recursive ADT - Nested pattern matching', () => {
		const result = runCode(`
		type Tree a = Node a (Tree a) (Tree a) | Leaf;

		sumTree = fn t => match t with (
			Node value left right => value + (sumTree left) + (sumTree right);
			Leaf => 0
		);

		tree = Node 1 (Node 2 Leaf Leaf) (Node 3 Leaf Leaf);
		sumTree tree
	`);

		expect(result.evalResult.finalResult).toEqual({ tag: 'number', value: 6 });
	});
});
