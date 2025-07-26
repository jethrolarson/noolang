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

	describe('Accessor Constraints (Automatic has constraints)', () => {
		it('should automatically add has constraints to accessors', () => {
			const program = parseProgram(`
				getName = @name;
				result = getName {@name "Alice", @age 30}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// The accessor should work with records that have the required field
		});

		it('should reject accessor on record missing the field', () => {
			const program = parseProgram(`
				getName = @name;
				result = getName {@age 30}
			`);
			
			expect(() => typeProgram(program)).toThrow();
		});

		it('should work with accessor on different field types', () => {
			const program = parseProgram(`
				getAge = @age;
				result = getAge {@age 30}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// The accessor should work with any field type
		});

		it('should work with multiple different accessors', () => {
			const program = parseProgram(`
				getName = @name;
				getAge = @age;
				person = {@name "Alice", @age 30};
				name = getName person;
				age = getAge person
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
		});

		it('should work with accessor composition', () => {
			const program = parseProgram(`
				getAddress = @address;
				getStreet = @street;
				getFullAddress = fn person => getStreet (getAddress person);
				result = getFullAddress {@address {@street "123 Main St", @city "NYC"}, @name "Alice"}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// Accessor composition should work correctly
		});

		it('should work with accessors in function definitions', () => {
			const program = parseProgram(`
				greet = fn person => concat "Hello " (@name person);
				result = greet {@name "Alice", @occupation "Engineer"}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// Accessors in function bodies should work correctly
		});

		it('should work with accessors and lists', () => {
			const program = parseProgram(`
				getNames = fn people => map @name people;
				people = [{@name "Alice", @age 30}, {@name "Bob", @age 25}];
				result = getNames people
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// Mapping accessors over lists should work
		});

		it('should handle accessor with polymorphic return type', () => {
			const program = parseProgram(`
				getValue = @value;
				stringValue = getValue {@value "hello"}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// Accessor should work with polymorphic field types
		});

		it('should reject accessor on completely wrong record type', () => {
			const program = parseProgram(`
				getName = @name;
				result = getName 42
			`);
			
			expect(() => typeProgram(program)).toThrow();
		});

		it('should work with nested record access', () => {
			const program = parseProgram(`
				getAddress = @address;
				getCity = @city;
				getCityFromPerson = fn person => getCity (getAddress person);
				result = getCityFromPerson {
					@name "Alice",
					@address {@street "123 Main", @city "NYC"}
				}
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// Nested accessor chains should work
		});

		it('should work with accessor partial application', () => {
			const program = parseProgram(`
				getName = @name;
				mapGetName = map getName;
				people = [{@name "Alice"}, {@name "Bob"}];
				result = mapGetName people
			`);
			const result = typeProgram(program);
			expect(result).toBeDefined();
			// Partial application of accessors should work
		});
	});
});