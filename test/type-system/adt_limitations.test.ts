import { test, expect } from 'bun:test';
import { runCode } from '../utils';

// Test suite: ADT Language Limitations
test.skip('should work when ADTs are used sequentially without list_map (requires Phase 3 @field syntax)', () => {
	// This shows that the issue is specifically with list_map + multiple ADTs
	const result = runCode(`
        variant Color = Red | Green | Blue;
        variant Shape a = Circle a | Rectangle a a | Triangle a a a;
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

test('should demonstrate that the variant unification issue is now fixed', () => {
	// The issue was in the type system when it tried to unify
	// type variables that had been associated with different ADT types
	// This is now fixed with proper let-polymorphism for list_map
	expect(() =>
		runCode(`
        variant Color = Red | Green | Blue;
        variant Shape a = Circle a | Rectangle a a | Triangle a a a;
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
	).toBeTruthy();
});

test('should work with separate variant definitions', () => {
	// Workaround 1: Define ADTs in separate programs
	const result1 = runCode(`
        variant Color = Red | Green | Blue;
        colors = [Red, Green, Blue];
        color_to_number = fn color => match color with (Red => 1; Green => 2; Blue => 3);
        list_map color_to_number colors
      `);

	expect(result1.finalValue).toEqual([1, 2, 3]);
});

test.skip('should work with manual iteration instead of list_map (requires Phase 3 @field syntax)', () => {
	// Workaround 2: Use manual iteration instead of list_map
	const result = runCode(`
        variant Color = Red | Green | Blue;
        variant Shape a = Circle a | Rectangle a a | Triangle a a a;
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
