import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { Evaluator } from '../../src/evaluator/evaluator';
import { typeProgram } from '../../src/typer';
import { typeToString } from '../../src/typer/helpers';

// Helper function to parse and evaluate Noolang code
const runNoolang = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	// Type check first
	const typeResult = typeProgram(program);

	// Then evaluate
	const evaluator = new Evaluator();
	const evalResult = evaluator.evaluateProgram(program);

	return {
		typeResult,
		evalResult,
		finalType: typeToString(typeResult.type, typeResult.state.substitution),
		finalValue: evalResult.finalResult,
	};
};

test('Algebraic Data Types (ADTs) - Built-in Option Type - should create Some values', () => {
	const result = runNoolang(`
		x = Some 42;
		x
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Some',
		args: [{ tag: 'number', value: 42 }],
	});
});

test('Algebraic Data Types (ADTs) - Built-in Option Type - should create None values', () => {
	const result = runNoolang(`
		x = None;
		x
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'None',
		args: [],
	});
});

test('Algebraic Data Types (ADTs) - Built-in Option Type - should pattern match on Some', () => {
	const result = runNoolang(`
		opt = Some 42;
		match opt with (
			Some x => x;
			None => 0
		)
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 42,
	});
});

test('Algebraic Data Types (ADTs) - Built-in Option Type - should pattern match on None', () => {
	const result = runNoolang(`
		opt = None;
		match opt with (
			Some x => x;
			None => 0
		)
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 0,
	});
});

test('Algebraic Data Types (ADTs) - Built-in Option Type - should handle nested Some values', () => {
	const result = runNoolang(`
		nested = Some (Some 42);
		match nested with (
			Some (Some x) => x;
			Some None => -1;
			None => 0
		)
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 42,
	});
});

test('Algebraic Data Types (ADTs) - Custom ADT Definition - should define simple ADT', () => {
	const result = runNoolang(`
		type Color = Red | Green | Blue;
		x = Red;
		x
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Red',
		args: [],
	});
});

test('Algebraic Data Types (ADTs) - Custom ADT Definition - should pattern match on custom ADT', () => {
	const result = runNoolang(`
		type Color = Red | Green | Blue;
		
		colorToString = fn color => match color with (
			Red => "red";
			Green => "green";
			Blue => "blue"
		);
		
		colorToString Red
	`);

	assert.equal(result.finalValue, {
		tag: 'string',
		value: 'red',
	});
});

test('Algebraic Data Types (ADTs) - Custom ADT Definition - should define ADT with parameters', () => {
	const result = runNoolang(`
		type Box a = Empty | Full a;
		x = Full 42;
		x
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Full',
		args: [{ tag: 'number', value: 42 }],
	});
});

test('Algebraic Data Types (ADTs) - Custom ADT Definition - should handle ADT with single parameter', () => {
	const result = runNoolang(`
		type Wrapper = Wrap Float;
		x = Wrap 42;
		x
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Wrap',
		args: [{ tag: 'number', value: 42 }],
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should handle recursive ADTs', () => {
	const result = runNoolang(`
		type List a = Cons a (List a) | Nil;
		list = Cons 1 (Cons 2 Nil);
		list
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Cons',
		args: [
			{ tag: 'number', value: 1 },
			{
				tag: 'constructor',
				name: 'Cons',
				args: [{ tag: 'number', value: 2 }, { tag: 'constructor', name: 'Nil', args: [] }],
			},
		],
	});
});

test('Recursive ADT - Binary Tree construction and pattern matching', () => {
	const result = runNoolang(`
		type Tree a = Node a (Tree a) (Tree a) | Leaf;
		
		tree = Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf);
		
		getValue = fn t => match t with (
			Node value _ _ => value;
			Leaf => 0
		);
		
		getValue tree
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 5,
	});
});

test('Recursive ADT - List operations with pattern matching', () => {
	const result = runNoolang(`
		type List a = Cons a (List a) | Nil;
		
		head = fn list => match list with (
			Cons h _ => h;
			Nil => 0
		);
		
		tail = fn list => match list with (
			Cons _ t => t;
			Nil => Nil
		);
		
		list = Cons 1 (Cons 2 (Cons 3 Nil));
		head (tail list)
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 2,
	});
});

test('Recursive ADT - Nested pattern matching', () => {
	const result = runNoolang(`
		type List a = Cons a (List a) | Nil;
		
		length = fn list => match list with (
			Nil => 0;
			Cons _ tail => 1 + (length tail)
		);
		
		list = Cons 1 (Cons 2 (Cons 3 Nil));
		length list
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 3,
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should handle complex pattern matching with variables', () => {
	const result = runNoolang(`
		type Result a b = Ok a | Error b;
		
		unwrap = fn result => match result with (
			Ok value => value;
			Error msg => 0
		);
		
		unwrap (Ok 42)
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 42,
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should match on ADT with multiple parameters', () => {
	const result = runNoolang(`
		type Point = Point Float Float;
		
		getX = fn point => match point with (
			Point x y => x
		);
		
		getX (Point 3 4)
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 3,
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should handle nested pattern matching', () => {
	const result = runNoolang(`
		type Inner = InnerValue Float;
		type Outer = OuterValue Inner;
		
		getValue = fn outer => match outer with (
			OuterValue inner => match inner with (
				InnerValue value => value
			)
		);
		
		getValue (OuterValue (InnerValue 42))
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 42,
	});
});

test('Algebraic Data Types (ADTs) - Type Inference - should infer ADT types correctly', () => {
	const result = runNoolang(`
		type Maybe a = Just a | Nothing;
		x = Just 42;
		x
	`);

	assert.is(result.finalType, 'Maybe Float');
	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Just',
		args: [{ tag: 'number', value: 42 }],
	});
});

test('Algebraic Data Types (ADTs) - Type Inference - should handle polymorphic ADTs', () => {
	const result = runNoolang(`
		type Container a = Container a;
		
		makeContainer = fn value => Container value;
		
		stringContainer = makeContainer "hello";
		numberContainer = makeContainer 42;
		
		stringContainer
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Container',
		args: [{ tag: 'string', value: 'hello' }],
	});
});

test('Algebraic Data Types (ADTs) - Function Integration - should work with functions that return ADTs', () => {
	const result = runNoolang(`
		type Status = Success | Failure;
		
		checkNumber = fn x => if x > 0 then Success else Failure;
		
		checkNumber 5
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Success',
		args: [],
	});
});

test('Algebraic Data Types (ADTs) - Function Integration - should work with functions that take ADTs as parameters', () => {
	const result = runNoolang(`
		type Status = Success | Failure;
		
		statusToNumber = fn status => match status with (
			Success => 1;
			Failure => 0
		);
		
		statusToNumber Success
	`);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 1,
	});
});

test('Algebraic Data Types (ADTs) - Function Integration - should work with list_map and ADTs', () => {
	const result = runNoolang(`
		type Status = Success | Failure;
		
		statusToNumber = fn status => match status with (
			Success => 1;
			Failure => 0
		);
		
		statuses = [Success, Failure, Success];
		list_map statusToNumber statuses
	`);

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [
			{ tag: 'number', value: 1 },
			{ tag: 'number', value: 0 },
			{ tag: 'number', value: 1 },
		],
	});
});

test.skip('Algebraic Data Types (ADTs) - Multiple ADTs - should handle multiple ADT definitions in the same program - TODO: Fix ADT pattern matching', () => {
	const result = runNoolang(`
		type Color = Red | Green | Blue;
		type Size = Small | Medium | Large;
		
		item = {Red, Small};
		item
	`);

	assert.equal(result.finalValue, {
		tag: 'tuple',
		values: [
			{ tag: 'constructor', name: 'Red', args: [] },
			{ tag: 'constructor', name: 'Small', args: [] },
		],
	});
});

test.skip('Algebraic Data Types (ADTs) - Multiple ADTs - should handle pattern matching on different ADTs separately - TODO: Fix ADT pattern matching', () => {
	const result = runNoolang(`
		type Color = Red | Green | Blue;
		type Size = Small | Medium | Large;
		
		colorToString = fn color => match color with (Red => "red"; Green => "green"; Blue => "blue");
		sizeToString = fn size => match size with (Small => "small"; Medium => "medium"; Large => "large");
		
		colorToString Red
	`);

	assert.equal(result.finalValue, {
		tag: 'string',
		value: 'red',
	});
});

test.skip('Algebraic Data Types (ADTs) - Multiple ADTs - should now work with list_map and multiple ADTs (polymorphism fixed) - TODO: Actually fix it', () => {
	const result = runNoolang(`
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

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [
			{ tag: 'constructor', name: 'Failure', args: [] },
			{ tag: 'constructor', name: 'Success', args: [] },
			{ tag: 'constructor', name: 'Failure', args: [] },
		],
	});
});

test.skip('Algebraic Data Types (ADTs) - Edge Cases - should handle ADT constructors with no parameters - TODO: Fix parser for types with same name as constructor', () => {
	const result = runNoolang(`
		type Unit = Unit;
		x = Unit;
		x
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Unit',
		args: [],
	});
});

test.skip('Algebraic Data Types (ADTs) - Edge Cases - should handle ADT with same name as constructor - TODO: Fix parser for types with same name as constructor', () => {
	const result = runNoolang(`
		type Unit = Unit;
		
		isUnit = fn x => match x with (
			Unit => True
		);
		
		isUnit Unit
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'True',
		args: [],
	});
});

test.skip('Algebraic Data Types (ADTs) - Complex Scenarios - should work when shapes are processed separately - TODO: Fix ADT pattern matching', () => {
	const result = runNoolang(`
		type Color = Red | Green | Blue;
		type Shape a = Circle a | Rectangle a a | Triangle a a a;
		shapes = [Circle 3, Rectangle 5 4];
		calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
		areas = list_map calculate_area shapes;
		areas
	`);

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [
			{ tag: 'number', value: 27 },
			{ tag: 'number', value: 20 },
		],
	});
});

test('Algebraic Data Types (ADTs) - Generic Constructors - should handle Point with generic parameters (issue fix)', () => {
	const result = runNoolang(`
		type Point a = Point a a;
		origin = Point 0.0 0.0;
		origin
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Point',
		args: [
			{ tag: 'number', value: 0.0 },
			{ tag: 'number', value: 0.0 }
		],
	});
});

test('Algebraic Data Types (ADTs) - Generic Constructors - should handle Shape with multiple constructors (issue fix)', () => {
	const result = runNoolang(`
		type Shape a = Circle a | Rectangle a a;
		circle = Circle 5.0;
		circle
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Circle',
		args: [{ tag: 'number', value: 5.0 }],
	});
});

test('Algebraic Data Types (ADTs) - Generic Constructors - should handle partial application of generic constructors', () => {
	const result = runNoolang(`
		type Point a = Point a a;
		makeOrigin = Point 0.0;
		point = makeOrigin 0.0;
		point
	`);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Point',
		args: [
			{ tag: 'number', value: 0.0 },
			{ tag: 'number', value: 0.0 }
		],
	});
});

test.run();
