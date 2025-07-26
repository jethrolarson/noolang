import { describe, it, expect } from '@jest/globals';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram, createTypeState } from '..';
import { typeToString } from '../helpers';
import { initializeBuiltins } from '../builtins';

// Helper function to parse a string into a program
const parseProgram = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

describe('Structural Constraints with `has` keyword', () => {
	describe('Basic Structural Constraints', () => {
		it('should support basic has constraint with single field', () => {
			const program = parseProgram(`
				greet = (fn person => concat "Hello " (@name person))
					: a -> String given a has {@name String}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			
			// Function should have constraint in its type
			const typeStr = typeToString(result.type, result.state.substitution);
			expect(typeStr).toContain('String');
		});

		it('should support has constraint with multiple fields', () => {
			const program = parseProgram(`
				processUser = (fn user => concat (@firstName user) (@lastName user))
					: a -> String given a has {@firstName String, @lastName String}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});

		it('should work with record that has extra fields (duck typing)', () => {
			const program = parseProgram(`
				getName = (fn obj => @name obj) : a -> String given a has {@name String};
				result = getName {@name "Alice", @age 30, @city "NYC"}
			`);
			const result = typeProgram(program);
			const typeStr = typeToString(result.type, result.state.substitution);
			expect(typeStr).toBe('String');
		});
	});

	describe('Constraint Validation', () => {
		it('should reject record missing required field', () => {
			const program = parseProgram(`
				getName = (fn obj => @name obj) : a -> String given a has {@name String};
				result = getName {@age 30}
			`);
			
			expect(() => typeProgram(program)).toThrow();
		});

		it('should reject record with wrong field type', () => {
			const program = parseProgram(`
				getName = (fn obj => @name obj) : a -> String given a has {@name String};
				result = getName {@name 42}
			`);
			
			expect(() => typeProgram(program)).toThrow();
		});

		it('should validate multiple fields correctly', () => {
			const program = parseProgram(`
				processUser = (fn user => concat (@firstName user) (@lastName user))
					: a -> String given a has {@firstName String, @lastName String};
				result = processUser {@firstName "John", @lastName "Doe", @age 30}
			`);
			const result = typeProgram(program);
			const typeStr = typeToString(result.type, result.state.substitution);
			expect(typeStr).toBe('String');
		});
	});

	describe('Nested Record Constraints', () => {
		it('should support nested record structures', () => {
			const program = parseProgram(`
				getStreet = (fn obj => @street (@address obj))
					: a -> String given a has {@address {@street String}}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});

		it('should work with nested records', () => {
			const program = parseProgram(`
				getStreet = fn obj => @street (@address obj)
					: a -> String given a has {@address {@street String}};
				result = getStreet {@address {@street "123 Main St", @city "NYC"}, @name "John"}
			`);
			const result = typeProgram(program);
			const typeStr = typeToString(result.type, result.state.substitution);
			expect(typeStr).toBe('String');
		});
	});

	describe('Integration with Existing Features', () => {
		it('should work with function composition', () => {
			const program = parseProgram(`
				getName = fn obj => @name obj : a -> String given a has {@name String};
				compose = fn f g => fn x => f (g x);
				processName = compose getName;
				result = processName {@name "Alice", @age 30}
			`);
			const result = typeProgram(program);
			const typeStr = typeToString(result.type, result.state.substitution);
			expect(typeStr).toBe('String');
		});

		it('should combine with existing trait constraints', () => {
			const program = parseProgram(`
				processItems = fn container => 
					map show (@items container)
					: a -> List String given a has {@items List b} and Show b
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});

		it('should work with pipeline operators', () => {
			const program = parseProgram(`
				getName = fn obj => @name obj : a -> String given a has {@name String};
				result = {@name "Alice", @age 30} | getName
			`);
			const result = typeProgram(program);
			const typeStr = typeToString(result.type, result.state.substitution);
			expect(typeStr).toBe('String');
		});
	});

	describe('Complex Structural Constraints', () => {
		it('should handle multiple constraint combinations', () => {
			const program = parseProgram(`
				complexFunction = fn obj => 
					concat (@user (@profile obj)) (@title obj)
					: a -> String given a has {@profile {@user String}, @title String}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});

		it('should work with polymorphic field types', () => {
			const program = parseProgram(`
				getItems = fn container => @items container
					: a -> List b given a has {@items List b}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});
	});
});