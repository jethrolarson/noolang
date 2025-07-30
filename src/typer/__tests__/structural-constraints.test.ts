import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeProgram, createTypeState } from '..';
import { typeToString } from '../helpers';
import { initializeBuiltins } from '../builtins';
import { describe, test, expect } from 'bun:test';

// Helper function to parse a string into a program
const parseProgram = (source: string) => {
	const lexer = new Lexer(source);
	const tokens = lexer.tokenize();
	return parse(tokens);
};

test('Structural Constraints with `has` keyword - Basic Structural Constraints - should support basic has constraint with single field', () => {
	const program = parseProgram(`
		greet = (fn person => concat "Hello " (@name person))
			: a -> String given a has {@name String}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	
	// Function should have constraint in its type
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr.includes('String').toBeTruthy();
});

test('Structural Constraints with `has` keyword - Basic Structural Constraints - should support has constraint with multiple fields', () => {
	const program = parseProgram(`
		processUser = (fn user => concat (@firstName user) (@lastName user))
			: a -> String given a has {@firstName String, @lastName String}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
});

test('Structural Constraints with `has` keyword - Basic Structural Constraints - should work with record that has extra fields (duck typing)', () => {
	const program = parseProgram(`
		getName = (fn obj => @name obj) : a -> String given a has {@name String};
		result = getName {@name "Alice", @age 30, @city "NYC"}
	`);
	const result = typeProgram(program);
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('String');
});

test('Structural Constraints with `has` keyword - Constraint Validation - should reject record missing required field', () => {
	const program = parseProgram(`
		getName = (fn obj => @name obj) : a -> String given a has {@name String};
		result = getName {@age 30}
	`);
	
	expect(() => typeProgram(program).toThrow());
});

test('Structural Constraints with `has` keyword - Constraint Validation - should reject record with wrong field type', () => {
	const program = parseProgram(`
		getName = (fn obj => @name obj) : a -> String given a has {@name String};
		result = getName {@name 42}
	`);
	
	expect(() => typeProgram(program).toThrow());
});

test('Structural Constraints with `has` keyword - Constraint Validation - should validate multiple fields correctly', () => {
	const program = parseProgram(`
		processUser = (fn user => concat (@firstName user) (@lastName user))
			: a -> String given a has {@firstName String, @lastName String};
		result = processUser {@firstName "John", @lastName "Doe", @age 30}
	`);
	const result = typeProgram(program);
	const typeStr = typeToString(result.type, result.state.substitution);
	expect(typeStr).toBe('String');
});

test('Structural Constraints with `has` keyword - Working Examples - should work with polymorphic field types', () => {
	const program = parseProgram(`
		getItems = (fn container => @items container)
			: a -> List b given a has {@items List b}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should automatically add has constraints to accessors', () => {
	const program = parseProgram(`
		getName = @name;
		result = getName {@name "Alice", @age 30}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// The accessor should work with records that have the required field
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should reject accessor on record missing the field', () => {
	const program = parseProgram(`
		getName = @name;
		result = getName {@age 30}
	`);
	
	expect(() => typeProgram(program).toThrow());
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessor on different field types', () => {
	const program = parseProgram(`
		getAge = @age;
		result = getAge {@age 30}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// The accessor should work with any field type
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with multiple different accessors', () => {
	const program = parseProgram(`
		getName = @name;
		getAge = @age;
		person = {@name "Alice", @age 30};
		name = getName person;
		age = getAge person
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessor composition', () => {
	const program = parseProgram(`
		getAddress = @address;
		getStreet = @street;
		getFullAddress = fn person => getStreet (getAddress person);
		result = getFullAddress {@address {@street "123 Main St", @city "NYC"}, @name "Alice"}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// Accessor composition should work correctly
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessors in function definitions', () => {
	const program = parseProgram(`
		greet = fn person => concat "Hello " (@name person);
		result = greet {@name "Alice", @occupation "Engineer"}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// Accessors in function bodies should work correctly
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessors and lists', () => {
	const program = parseProgram(`
		getNames = fn people => map @name people;
		people = [{@name "Alice", @age 30}, {@name "Bob", @age 25}];
		result = getNames people
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// Mapping accessors over lists should work
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should handle accessor with polymorphic return type', () => {
	const program = parseProgram(`
		getValue = @value;
		stringValue = getValue {@value "hello"}
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// Accessor should work with polymorphic field types
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should reject accessor on completely wrong record type', () => {
	const program = parseProgram(`
		getName = @name;
		result = getName 42
	`);
	
	expect(() => typeProgram(program).toThrow());
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with nested record access', () => {
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
	expect(expect(result).toBeTruthy();
	// Nested accessor chains should work
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessor partial application', () => {
	const program = parseProgram(`
		getName = @name;
		mapGetName = map getName;
		people = [{@name "Alice"}, {@name "Bob"}];
		result = mapGetName people
	`);
	const result = typeProgram(program);
	expect(expect(result).toBeTruthy();
	// Partial application of accessors should work
});

