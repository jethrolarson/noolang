import { describe, test, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { Evaluator } from '../../evaluator/evaluator';
import { typeProgram } from '../index';
import { typeToString } from '../helpers';

// Helper function to parse, type check, and evaluate Noolang code
const typeAndRun = (source: string) => {
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
		errors: typeResult.errors.length > 0 ? typeResult.errors.map(e => e.message) : evalResult.errors.map(e => e.message),
		values: evalResult.finalEnvironment,
	};
};

describe('Trait System Phase 2: Nominal Traits', () => {
	describe('Functor trait', () => {
		test('map function should work with Option', () => {
			const code = `
				// Define the Functor trait  
				constraint Functor f {
					map: (a -> b) -> f a -> f b
				}
				
				// Implement Functor for Option
				implement Functor Option {
					map f opt = case opt {
						Some x -> Some (f x)
						None -> None
					}
				}
				
				// Helper function
				increment x = x + 1
				
				// Test map with Some
				result1 = map increment (Some 1)
				result2 = map increment None
			`;

			const result = typeAndRun(code);
			expect(result.errors).toEqual([]);
			expect(result.values?.get('result1')).toEqual({ tag: 'Some', value: 2 });
			expect(result.values?.get('result2')).toEqual({ tag: 'None' });
		});

		test('map function with multiple types', () => {
			const code = `
				constraint Functor f {
					map: (a -> b) -> f a -> f b
				}
				
				implement Functor Option {
					map f opt = case opt {
						Some x -> Some (f x)
						None -> None
					}
				}
				
				implement Functor List {
					map f xs = case xs {
						[] -> []
						(y :: ys) -> f y :: map f ys
					}
				}
				
				double x = x * 2
				
				opt_result = map double (Some 5)
				list_result = map double [1, 2, 3]
			`;

			const result = typeAndRun(code);
			expect(result.errors).toEqual([]);
			expect(result.values?.get('opt_result')).toEqual({ tag: 'Some', value: 10 });
			expect(result.values?.get('list_result')).toEqual([2, 4, 6]);
		});
	});

	describe('Show trait', () => {
		test('show function should work with basic types', () => {
			const code = `
				constraint Show a {
					show: a -> String
				}
				
				implement Show Int {
					show x = toString x
				}
				
				implement Show String {
					show x = "\"" ++ x ++ "\""
				}
				
				implement Show Option {
					show opt = case opt {
						Some x -> "Some(" ++ show x ++ ")"
						None -> "None"
					}
				}
				
				result1 = show 42
				result2 = show "hello"
				result3 = show (Some 123)
				result4 = show None
			`;

			const result = typeAndRun(code);
			expect(result.errors).toEqual([]);
			expect(result.values?.get('result1')).toEqual('42');
			expect(result.values?.get('result2')).toEqual('"hello"');
			expect(result.values?.get('result3')).toEqual('Some(123)');
			expect(result.values?.get('result4')).toEqual('None');
		});
	});

	describe('Eq trait', () => {
		test('eq function should work with basic types', () => {
			const code = `
				constraint Eq a {
					eq: a -> a -> Bool
				}
				
				implement Eq Int {
					eq x y = x == y
				}
				
				implement Eq String {
					eq x y = x == y
				}
				
				implement Eq Option {
					eq opt1 opt2 = case opt1 {
						Some x -> case opt2 {
							Some y -> eq x y
							None -> False
						}
						None -> case opt2 {
							Some _ -> False
							None -> True
						}
					}
				}
				
				result1 = eq 5 5
				result2 = eq 5 3
				result3 = eq "hello" "hello"
				result4 = eq (Some 1) (Some 1)
				result5 = eq (Some 1) (Some 2)
				result6 = eq None None
				result7 = eq (Some 1) None
			`;

			const result = typeAndRun(code);
			expect(result.errors).toEqual([]);
			expect(result.values?.get('result1')).toEqual(true);
			expect(result.values?.get('result2')).toEqual(false);
			expect(result.values?.get('result3')).toEqual(true);
			expect(result.values?.get('result4')).toEqual(true);
			expect(result.values?.get('result5')).toEqual(false);
			expect(result.values?.get('result6')).toEqual(true);
			expect(result.values?.get('result7')).toEqual(false);
		});
	});

	describe('Error cases', () => {
		test('should error when trait implementation is missing', () => {
			const code = `
				constraint Functor f {
					map: (a -> b) -> f a -> f b
				}
				
				// No implementation for String
				result = map (\\x -> x + 1) "hello"
			`;

			const result = typeAndRun(code);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toContain('Functor');
		});

		test('should error when constraint is not satisfied', () => {
			const code = `
				constraint Show a {
					show: a -> String
				}
				
				implement Show Int {
					show x = toString x
				}
				
				// Bool doesn't have Show implementation
				result = show True
			`;

			const result = typeAndRun(code);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('Complex trait interactions', () => {
		test('trait functions with partial application', () => {
			const code = `
				constraint Functor f {
					map: (a -> b) -> f a -> f b
				}
				
				implement Functor Option {
					map f opt = case opt {
						Some x -> Some (f x)
						None -> None
					}
				}
				
				// Partial application of map
				mapIncrement = map (\\x -> x + 1)
				
				result1 = mapIncrement (Some 5)
				result2 = mapIncrement None
			`;

			const result = typeAndRun(code);
			expect(result.errors).toEqual([]);
			expect(result.values?.get('result1')).toEqual({ tag: 'Some', value: 6 });
			expect(result.values?.get('result2')).toEqual({ tag: 'None' });
		});

		test('chaining trait function calls', () => {
			const code = `
				constraint Functor f {
					map: (a -> b) -> f a -> f b
				}
				
				implement Functor Option {
					map f opt = case opt {
						Some x -> Some (f x)
						None -> None
					}
				}
				
				add1 x = x + 1
				times2 x = x * 2
				
				result = map times2 (map add1 (Some 3))
			`;

			const result = typeAndRun(code);
			expect(result.errors).toEqual([]);
			expect(result.values?.get('result')).toEqual({ tag: 'Some', value: 8 });
		});
	});
});