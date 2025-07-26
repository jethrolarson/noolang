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

	describe('Working Examples', () => {
		it('should work with polymorphic field types', () => {
			const program = parseProgram(`
				getItems = (fn container => @items container)
					: a -> List b given a has {@items List b}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});
	});
});