import { describe, it, expect } from '@jest/globals';
import { Lexer } from '../../src/lexer';
import { parse } from '../../src/parser/parser';
import { Evaluator } from '../../src/evaluator';
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

describe('Algebraic Data Types (ADTs)', () => {
	describe('Built-in Option Type', () => {
		it('should create Some values', () => {
			const result = runNoolang(`
        x = Some 42;
        x
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'Some',
				args: [{ tag: 'number', value: 42 }],
			});
		});

		it('should create None values', () => {
			const result = runNoolang(`
        x = None;
        x
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'None',
				args: [],
			});
		});

		it('should pattern match on Some', () => {
			const result = runNoolang(`
        x = Some 21;
        result = match x with (Some y => y * 2; None => 0);
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 42 });
		});

		it('should pattern match on None', () => {
			const result = runNoolang(`
        x = None;
        result = match x with (Some y => y * 2; None => 99);
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 99 });
		});

		it('should handle nested Option values', () => {
			const result = runNoolang(`
        nested = Some (Some 10);
        result = match nested with (
          Some inner => match inner with (Some value => value; None => 0);
          None => -1
        );
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 10 });
		});
	});

	describe('Built-in Result Type', () => {
		it('should create Ok values', () => {
			const result = runNoolang(`
        x = Ok 100;
        x
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'Ok',
				args: [{ tag: 'number', value: 100 }],
			});
		});

		it('should create Err values', () => {
			const result = runNoolang(`
        x = Err "failed";
        x
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'Err',
				args: [{ tag: 'string', value: 'failed' }],
			});
		});

		it('should pattern match on Ok', () => {
			const result = runNoolang(`
        x = Ok 50;
        result = match x with (Ok value => value + 10; Err msg => 0);
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 60 });
		});

		it('should pattern match on Err', () => {
			const result = runNoolang(`
        x = Err "oops";
        result = match x with (Ok value => value; Err msg => 404);
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 404 });
		});
	});

	describe('Custom ADT Definitions', () => {
		it('should define and use a simple ADT', () => {
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        favorite = Red;
        favorite
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'Red',
				args: [],
			});
		});

		it('should define ADT with parameters', () => {
			const result = runNoolang(`
        type Point a = Point a a;
        origin = Point 0 0;
        origin
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'Point',
				args: [
					{ tag: 'number', value: 0 },
					{ tag: 'number', value: 0 },
				],
			});
		});

		it('should pattern match on custom ADTs', () => {
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        getColorCode = fn color => match color with (
          Red => 1;
          Green => 2;
          Blue => 3
        );
        result = getColorCode Red;
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 1 });
		});

		/**
		 * RECURSIVE ADT LIMITATION
		 * 
		 * The following tests are skipped because recursive ADTs (like List and Tree)
		 * require fundamental type system enhancements that are not yet implemented.
		 * 
		 * REQUIRED LANGUAGE IMPROVEMENTS:
		 * 1. Self-referential type definitions in the type system
		 * 2. Recursive type unification and checking  
		 * 3. Proper handling of infinite type expansion
		 * 
		 * These represent core type system features that need to be implemented
		 * before these ADT patterns can be supported.
		 */
		it.skip('should handle recursive ADTs', () => {
			// Skipped: Recursive ADTs need additional type system work for self-references
			const result = runNoolang(`
        type List a = Nil | Cons a (List a);
        myList = Cons 1 (Cons 2 Nil);
        getFirst = fn list => match list with (
          Nil => 0;
          Cons x xs => x
        );
        result = getFirst myList;
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 1 });
		});

		it.skip('should handle complex pattern matching with variables', () => {
			// Skipped: Complex recursive pattern matching needs additional work
			const result = runNoolang(`
        type Tree a = Leaf a | Branch (Tree a) (Tree a);
        tree = Branch (Leaf 5) (Leaf 10);
        sumTree = fn t => match t with (
          Leaf value => value;
          Branch left right => (sumTree left) + (sumTree right)
        );
        result = sumTree tree;
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 15 });
		});
	});

	describe('Pattern Matching Features', () => {
		it('should handle wildcard patterns', () => {
			const result = runNoolang(`
        type Maybe a = Just a | Nothing;
        getValue = fn maybe => match maybe with (
          Just x => x;
          _ => 42
        );
        result = getValue Nothing;
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 42 });
		});

		it('should handle literal patterns', () => {
			const result = runNoolang(
				`type Status = Success | Error | Code Int; getStatusMessage = fn status => match status with (Success => "ok"; Error => "fail"; Code 404 => "not found"; Code x => "unknown code"); result = getStatusMessage (Code 404); result`
			);
			expect(result.finalValue).toEqual({ tag: 'string', value: 'not found' });
		});

		it('should handle nested patterns', () => {
			const result = runNoolang(
				`type Wrapper a = Wrap a; type Inner = Value Int; nested = Wrap (Value 123); extract = fn w => match w with (Wrap (Value n) => n; _ => 0); result = extract nested; result`
			);
			expect(result.finalValue).toEqual({ tag: 'number', value: 123 });
		});
	});

	describe('Type Checking', () => {
		it('should type check ADT constructors correctly', () => {
			const result = runNoolang(`
        type Option a = Some a | None;
        x = Some 42;
        x
      `);

			// Should infer that x has type Option Int
			expect(result.finalType).toMatch(/Option.*Int|variant.*Option/);
		});

		it('should enforce pattern exhaustiveness (implicit)', () => {
			// This should work - all patterns covered
			const result = runNoolang(`
        type Bool = True | False;
        negate = fn b => match b with (True => False; False => True);
        result = negate True;
        result
      `);

			expect(result.finalValue).toEqual({
				tag: 'constructor',
				name: 'False',
				args: [],
			});
		});

		it('should handle polymorphic ADTs', () => {
			const result = runNoolang(`
        type Pair a b = Pair a b;
        p = Pair 42 "hello";
        getFirst = fn pair => match pair with (Pair x y => x);
        result = getFirst p;
        result
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 42 });
		});
	});

	describe('Error Cases', () => {
		it('should error on unknown constructor in patterns', () => {
			expect(() => {
				runNoolang(`
          type Color = Red | Green | Blue;
          x = Red;
          match x with (Yellow => 1; Red => 2)
        `);
			}).toThrow();
		});

		it('should handle partial constructor application', () => {
			const result = runNoolang(`
        type Point = Point Int Int;
        p = Point 1;  # Partial application - returns (Int) -> Point
        p
      `);

			// Should return a function type since it's a partial application
			expect(result.finalType).toMatch(/Int.*Point|function/);
		});

		it('should error when no pattern matches', () => {
			expect(() => {
				const evaluator = new Evaluator();
				const source = `
          type Color = Red | Green | Blue;
          x = Blue;
          match x with (Red => 1; Green => 2)  # Missing Blue case
        `;
				const lexer = new Lexer(source);
				const tokens = lexer.tokenize();
				const program = parse(tokens);
				evaluator.evaluateProgram(program);
			}).toThrow('No pattern matched');
		});
	});

	describe('Integration with Built-in Functions', () => {
		it('should work with map and Option', () => {
			const result = runNoolang(`
        options = [Some 1, None, Some 3];
        extractValue = fn opt => match opt with (Some x => x; None => 0);
        result = map extractValue options;
        result
      `);

			expect(result.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'number', value: 1 },
					{ tag: 'number', value: 0 },
					{ tag: 'number', value: 3 },
				],
			});
		});

		it('should work with filter and custom ADTs', () => {
			const result = runNoolang(`
        type Status = Active | Inactive;
        items = [Active, Inactive, Active, Active];
        isActive = fn status => match status with (Active => True; Inactive => False);
        result = filter isActive items;
        result
      `);

			expect(result.finalValue.tag).toBe('list');
			if (result.finalValue.tag === 'list') {
				expect(result.finalValue.values).toHaveLength(3);
				result.finalValue.values.forEach((item: any) => {
					expect(item).toEqual({
						tag: 'constructor',
						name: 'Active',
						args: [],
					});
				});
			}
		});
	});

	describe('Multiple ADT Definitions', () => {
		it('should handle multiple ADT definitions in the same program', () => {
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        colors = [Red, Green, Blue];
        shapes = [Circle 3, Rectangle 5 4];
        colors
      `);

			expect(result.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'constructor', name: 'Red', args: [] },
					{ tag: 'constructor', name: 'Green', args: [] },
					{ tag: 'constructor', name: 'Blue', args: [] },
				],
			});
		});

		it('should handle pattern matching on different ADTs separately', () => {
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        color_to_number Red
      `);

			expect(result.finalValue).toEqual({ tag: 'number', value: 1 });
		});

		it('should now work with map and multiple ADTs (polymorphism fixed)', () => {
			// This test was previously failing due to lack of polymorphism in map
			// Now that map is properly polymorphic, it should work
			expect(() =>
				runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        colors = [Red, Green, Blue];
        shapes = [Circle 3, Rectangle 5 4];
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        color_numbers = map color_to_number colors;
        areas = map calculate_area shapes;
        color_numbers
      `)
			).not.toThrow();
		});

		it('should work when ADTs are used in separate operations', () => {
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        colors = [Red, Green, Blue];
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        color_numbers = map color_to_number colors;
        color_numbers
      `);

			expect(result.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'number', value: 1 },
					{ tag: 'number', value: 2 },
					{ tag: 'number', value: 3 },
				],
			});
		});

		it('should work when shapes are processed separately', () => {
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        shapes = [Circle 3, Rectangle 5 4];
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        areas = map calculate_area shapes;
        areas
      `);

			expect(result.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'number', value: 27 },
					{ tag: 'number', value: 20 },
				],
			});
		});
	});
});
