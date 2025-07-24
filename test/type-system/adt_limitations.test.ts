import { describe, it, expect } from '@jest/globals';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';
import { Evaluator } from '../../src/evaluator/evaluator';
import { typeToString } from '../../src/typer/helpers';

// Helper function to run Noolang code and get both value and type
const runNoolang = (code: string) => {
	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const ast = parse(tokens);
	const decoratedResult = typeAndDecorate(ast);
	const evaluator = new Evaluator();
	const result = evaluator.evaluateProgram(decoratedResult.program);

	return {
		finalValue: result.finalResult,
		finalType: decoratedResult.state
			? typeToString(
					decoratedResult.program.statements[
						decoratedResult.program.statements.length - 1
					].type!,
					decoratedResult.state.substitution
				)
			: 'unknown',
	};
};

describe('ADT Language Limitations', () => {
	describe('Multiple ADT Definitions', () => {
		it('should now work with list_map and multiple ADTs (polymorphism fixed)', () => {
			// This test was previously failing due to lack of polymorphism in list_map
			// Now that list_map is properly polymorphic, it should work
			expect(() =>
				runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        colors = [Red, Green, Blue];
        shapes = [Circle 3, Rectangle 5 4];
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        color_numbers = list_map color_to_number colors;
        areas = list_map calculate_area shapes;
        color_numbers
      `)
			).not.toThrow();
		});

		it('should work when ADTs are used in separate programs', () => {
			// This demonstrates the workaround: use ADTs in separate programs
			const colorResult = runNoolang(`
        type Color = Red | Green | Blue;
        colors = [Red, Green, Blue];
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        color_numbers = list_map color_to_number colors;
        color_numbers
      `);

			expect(colorResult.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'number', value: 1 },
					{ tag: 'number', value: 2 },
					{ tag: 'number', value: 3 },
				],
			});

			const shapeResult = runNoolang(`
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        shapes = [Circle 3, Rectangle 5 4];
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        areas = list_map calculate_area shapes;
        areas
      `);

			expect(shapeResult.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'number', value: 27 },
					{ tag: 'number', value: 20 },
				],
			});
		});

		it('should work when ADTs are used sequentially without list_map', () => {
			// This shows that the issue is specifically with list_map + multiple ADTs
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        color_result = color_to_number Red;
        shape_result = calculate_area (Circle 5);
        { @color color_result, @shape shape_result }
      `);

			expect(result.finalValue).toEqual({
				tag: 'record',
				fields: {
					color: { tag: 'number', value: 1 },
					shape: { tag: 'number', value: 75 },
				},
			});
		});
	});

	describe('Root Cause Analysis', () => {
		it('should demonstrate that the type unification issue is now fixed', () => {
			// The issue was in the type system when it tried to unify
			// type variables that had been associated with different ADT types
			// This is now fixed with proper let-polymorphism for list_map
			expect(() =>
				runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        # This works fine - no type unification issues
        colors = [Red, Green, Blue];
        shapes = [Circle 3, Rectangle 5 4];
        # This also works - separate operations
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        # This now works - list_map is properly polymorphic
        color_numbers = list_map color_to_number colors;
        areas = list_map calculate_area shapes;
        color_numbers
      `)
			).not.toThrow();
		});
	});

	describe('Workarounds', () => {
		it('should work with separate type definitions', () => {
			// Workaround 1: Define ADTs in separate programs
			const result1 = runNoolang(`
        type Color = Red | Green | Blue;
        colors = [Red, Green, Blue];
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        list_map color_to_number colors
      `);

			expect(result1.finalValue).toEqual({
				tag: 'list',
				values: [
					{ tag: 'number', value: 1 },
					{ tag: 'number', value: 2 },
					{ tag: 'number', value: 3 },
				],
			});
		});

		it('should work with manual iteration instead of list_map', () => {
			// Workaround 2: Use manual iteration instead of list_map
			const result = runNoolang(`
        type Color = Red | Green | Blue;
        type Shape a = Circle a | Rectangle a a | Triangle a a a;
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        calculate_area = fn shape => match shape with (Circle radius => radius * radius * 3; Rectangle width height => width * height; Triangle a b c => (a * b) / 2);
        # Manual iteration instead of list_map
        colors = [Red, Green, Blue];
        shapes = [Circle 3, Rectangle 5 4];
        color1 = color_to_number Red;
        color2 = color_to_number Green;
        color3 = color_to_number Blue;
        shape1 = calculate_area (Circle 3);
        shape2 = calculate_area (Rectangle 5 4);
        { @colors [color1, color2, color3], @shapes [shape1, shape2] }
      `);

			expect(result.finalValue).toEqual({
				tag: 'record',
				fields: {
					colors: {
						tag: 'list',
						values: [
							{ tag: 'number', value: 1 },
							{ tag: 'number', value: 2 },
							{ tag: 'number', value: 3 },
						],
					},
					shapes: {
						tag: 'list',
						values: [
							{ tag: 'number', value: 27 },
							{ tag: 'number', value: 20 },
						],
					},
				},
			});
		});
	});
});
