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

// Test suite: Algebraic Data Types (ADTs)
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

test('Algebraic Data Types (ADTs) - Built-in Option Type - should type check Option values correctly', () => {
	const someResult = runNoolang(`
        x = Some 42;
        x
      `);

	const noneResult = runNoolang(`
        x = None;
        x
      `);

	assert.equal(someResult.finalType, 'Option Float');
	assert.equal(noneResult.finalType, 'Option α');
});

test('Algebraic Data Types (ADTs) - Built-in Option Type - should handle nested Option values', () => {
	const result = runNoolang(`
        x = Some (Some 42);
        x
      `);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Some',
		args: [
			{
				tag: 'constructor',
				name: 'Some',
				args: [{ tag: 'number', value: 42 }],
			},
		],
	});
	assert.ok(result.finalType.includes('Option'), 'Type should be an Option type');
});

test('Algebraic Data Types (ADTs) - Custom ADT Definitions - should define simple ADTs', () => {
	const result = runNoolang(`
        type Bool = True | False;
        x = True;
        x
      `);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'True',
		args: [],
	});
});

test.skip('Algebraic Data Types (ADTs) - Custom ADT Definitions - should define ADTs with parameters - TODO: Fix parameterized ADT type unification', () => {
	const result = runNoolang(`
        type Maybe a = Just a | Nothing;
        x = Just 42;
        x
      `);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Just',
		args: [{ tag: 'number', value: 42 }],
	});
});

test('Algebraic Data Types (ADTs) - Custom ADT Definitions - should define ADTs with multiple parameters', () => {
	const result = runNoolang(`
        type Either a b = Left a | Right b;
        x = Left "error";
        y = Right 42;
        {x, y}
      `);

	assert.equal(result.finalValue, {
		tag: 'tuple',
		values: [
			{
				tag: 'constructor',
				name: 'Left',
				args: [{ tag: 'string', value: 'error' }],
			},
			{
				tag: 'constructor',
				name: 'Right',
				args: [{ tag: 'number', value: 42 }],
			},
		],
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should match on simple constructors', () => {
	const result = runNoolang(`
        type Bool = True | False;
        x = True;
        match x with (
          True => "yes";
          False => "no"
        )
      `);

	assert.equal(result.finalValue, {
		tag: 'string',
		value: 'yes',
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should match on constructors with arguments', () => {
	const result = runNoolang(`
        opt = Some 42;
        match opt with (
          Some x => x * 2;
          None => 0
        )
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 84,
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should handle nested pattern matching', () => {
	const result = runNoolang(`
        opt = Some (Some 42);
        match opt with (
          Some inner => match inner with (
            Some x => x;
            None => 0
          );
          None => -1
        )
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 42,
	});
});

test('Algebraic Data Types (ADTs) - Pattern Matching - should handle complex nested patterns', () => {
	const result = runNoolang(`
        type Either a b = Left a | Right b;
        val = Right (Some 42);
        match val with (
          Left x => -1;
          Right opt => match opt with (
            Some y => y + 10;
            None => 0
          )
        )
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 52,
	});
});

test('Algebraic Data Types (ADTs) - List Construction - should construct lists using built-in list syntax', () => {
	const result = runNoolang(`
        x = [1, 2, 3];
        x
      `);

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [
			{ tag: 'number', value: 1 },
			{ tag: 'number', value: 2 },
			{ tag: 'number', value: 3 },
		],
	});
});

test('Algebraic Data Types (ADTs) - List Construction - should handle empty lists', () => {
	const result = runNoolang(`
        x = [];
        x
      `);

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [],
	});
});

test('Algebraic Data Types (ADTs) - Functions with ADTs - should work with built-in list functions', () => {
	const result = runNoolang(`
        myList = [1, 2, 3];
        length myList
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 3,
	});
});

test('Algebraic Data Types (ADTs) - Functions with ADTs - should work with Option type functions', () => {
	const result = runNoolang(`
        unwrapOr = fn default => fn opt => match opt with (
          Some x => x;
          None => default
        );
        
        result1 = unwrapOr 0 (Some 42);
        result2 = unwrapOr 0 None;
        {result1, result2}
      `);

	assert.equal(result.finalValue, {
		tag: 'tuple',
		values: [
			{ tag: 'number', value: 42 },
			{ tag: 'number', value: 0 },
		],
	});
});

test('Algebraic Data Types (ADTs) - Functions with ADTs - should work with custom map function', () => {
	const result = runNoolang(`
        type Maybe a = Just a | Nothing;
        
        mapMaybe = fn f => fn maybe => match maybe with (
          Just x => Just (f x);
          Nothing => Nothing
        );
        
        addOne = fn x => x + 1;
        result = mapMaybe addOne (Just 41);
        result
      `);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Just',
		args: [{ tag: 'number', value: 42 }],
	});
});

test('Algebraic Data Types (ADTs) - Type Checking - should properly infer ADT types', () => {
	const result = runNoolang(`
        type Color = Red | Green | Blue;
        x = Red;
        x
      `);

	assert.equal(result.finalType, 'Color');
});

test('Algebraic Data Types (ADTs) - Type Checking - should properly infer parameterized ADT types', () => {
	const result = runNoolang(`
        type Box a = Box a;
        x = Box 42;
        x
      `);

	assert.equal(result.finalType, 'Box Float');
});

test('Algebraic Data Types (ADTs) - Type Checking - should handle polymorphic ADT functions', () => {
	const result = runNoolang(`
        type Maybe a = Just a | Nothing;
        
        isJust = fn maybe => match maybe with (
          Just _ => True;
          Nothing => False
        );
        
        result1 = isJust (Just 42);
        result2 = isJust (Just "hello");
        result3 = isJust Nothing;
        {result1, result2, result3}
      `);

	assert.equal(result.finalValue, {
		tag: 'tuple',
		values: [
			{ tag: 'constructor', name: 'True', args: [] },
			{ tag: 'constructor', name: 'True', args: [] },
			{ tag: 'constructor', name: 'False', args: [] },
		],
	});
});

test.skip('Algebraic Data Types (ADTs) - Advanced Patterns - should handle recursive ADTs - TODO: Recursive ADTs need additional type system work', () => {
	const result = runNoolang(`
        type Tree a = Leaf a | Node (Tree a) (Tree a);
        
        tree = Node (Leaf 1) (Node (Leaf 2) (Leaf 3));
        
        countLeaves = fn tree => match tree with (
          Leaf _ => 1;
          Node left right => countLeaves left + countLeaves right
        );
        
        countLeaves tree
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 3,
	});
});

test('Algebraic Data Types (ADTs) - Advanced Patterns - should handle mutual recursion', () => {
	const result = runNoolang(`
        type Expr = Num Float | Add Expr Expr | Mul Expr Expr;
        
        eval = fn expr => match expr with (
          Num n => n;
          Add left right => eval left + eval right;
          Mul left right => eval left * eval right
        );
        
        expr = Add (Num 2) (Mul (Num 3) (Num 4));
        eval expr
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 14,
	});
});

test.skip('Algebraic Data Types (ADTs) - Advanced Patterns - should handle ADTs with records - TODO: ADTs with record syntax needs parser improvements', () => {
	const result = runNoolang(`
        type Person = Person { @name String, @age Float };
        
        person = Person { @name "Alice", @age 30 };
        
        getName = fn p => match p with (
          Person { @name n, @age _ } => n
        );
        
        getName person
      `);

	assert.equal(result.finalValue, {
		tag: 'string',
		value: 'Alice',
	});
});

test('Algebraic Data Types (ADTs) - Complex Examples - should implement Result type', () => {
	const result = runNoolang(`
        type Result a b = Ok a | Err b;
        
        divide = fn x => fn y => 
          if y == 0 then Err "Division by zero" else Ok (x / y);
        
        result1 = divide 10 2;
        result2 = divide 10 0;
        
        {result1, result2}
      `);

	assert.equal(result.finalValue, {
		tag: 'tuple',
		values: [
			{
				tag: 'constructor',
				name: 'Ok',
				args: [{ tag: 'number', value: 5 }],
			},
			{
				tag: 'constructor',
				name: 'Err',
				args: [{ tag: 'string', value: 'Division by zero' }],
			},
		],
	});
});

test('Algebraic Data Types (ADTs) - Complex Examples - should chain Result operations', () => {
	const result = runNoolang(`
        type Result a b = Ok a | Err b;
        
        bind = fn result => fn f => match result with (
          Ok x => f x;
          Err e => Err e
        );
        
        safeDivide = fn x => fn y => 
          if y == 0 then Err "Division by zero" else Ok (x / y);
        
        computation = bind (safeDivide 20 4) (fn x => safeDivide x 2);
        computation
      `);

	assert.equal(result.finalValue, {
		tag: 'constructor',
		name: 'Ok',
		args: [{ tag: 'number', value: 2.5 }],
	});
});

test.skip('Algebraic Data Types (ADTs) - Complex Examples - should implement State monad-like pattern - TODO: Complex State monad pattern needs additional parser work', () => {
	const result = runNoolang(`
        type State s a = State (fn s => {value: a, state: s});
        
        runState = fn (State f) => fn state => f state;
        
        put = fn newState => State (fn _ => {value: {}, state: newState});
        get = State (fn state => {value: state, state: state});
        
        computation = State (fn state => {value: state + 1, state: state + 1});
        
        result = runState computation 0;
        result
      `);

	assert.equal(result.finalValue, {
		tag: 'record',
		fields: {
			value: { tag: 'number', value: 1 },
			state: { tag: 'number', value: 1 },
		},
	});
});

test('Algebraic Data Types (ADTs) - Error Cases - should handle type mismatches in pattern matching', () => {
	assert.throws(() => {
		runNoolang(`
          type Color = Red | Green | Blue;
          x = Red;
          match x with (
            Some _ => "matched";
            None => "none"
          )
        `);
	});
});

test('Algebraic Data Types (ADTs) - Error Cases - should handle incomplete pattern matches', () => {
	assert.throws(() => {
		runNoolang(`
          opt = Some 42;
          match opt with (
            Some x => x
          )
        `);
	});
});

test('Algebraic Data Types (ADTs) - Integration with Built-ins - should work with built-in list functions', () => {
	const result = runNoolang(`
        type Maybe a = Just a | Nothing;
        
        maybeValues = [Just 1, Nothing, Just 2, Just 3];
        
        unwrap = fn maybe => match maybe with (
          Just x => x;
          Nothing => 0
        );
        
        list_map unwrap maybeValues
      `);

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [
			{ tag: 'number', value: 1 },
			{ tag: 'number', value: 0 },
			{ tag: 'number', value: 2 },
			{ tag: 'number', value: 3 },
		],
	});
});

test('Algebraic Data Types (ADTs) - Integration with Built-ins - should work with filter and ADTs', () => {
	const result = runNoolang(`
        type Maybe a = Just a | Nothing;
        
        isJust = fn maybe => match maybe with (
          Just _ => True;
          Nothing => False
        );
        
        maybeValues = [Just 1, Nothing, Just 2, Nothing, Just 3];
        filter isJust maybeValues
      `);

	assert.equal(result.finalValue, {
		tag: 'list',
		values: [
			{
				tag: 'constructor',
				name: 'Just',
				args: [{ tag: 'number', value: 1 }],
			},
			{
				tag: 'constructor',
				name: 'Just',
				args: [{ tag: 'number', value: 2 }],
			},
			{
				tag: 'constructor',
				name: 'Just',
				args: [{ tag: 'number', value: 3 }],
			},
		],
	});
});

test('Algebraic Data Types (ADTs) - Performance - should handle deeply nested ADTs efficiently', () => {
	const result = runNoolang(`
        type List a = Cons a (List a) | Nil;
        
        buildList = fn n => 
          if n <= 0 then Nil else Cons n (buildList (n - 1));
        
        sumList = fn list => match list with (
          Nil => 0;
          Cons x xs => x + sumList xs
        );
        
        list = buildList 100;
        sumList list
      `);

	assert.equal(result.finalValue, {
		tag: 'number',
		value: 5050, // Sum of 1 to 100
	});
});

test.run();
