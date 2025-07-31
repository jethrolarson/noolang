import { test, expect } from 'bun:test';
import {
	assertFunctionType,
	assertHasStructureConstraint,
	assertPrimitiveType,
	parseAndType,
} from '../../../test/utils';

test('Structural Constraints with `has` keyword - Basic Structural Constraints - should support basic has constraint with single field', () => {
	const result = parseAndType(`
		greet = (fn person => concat "Hello " (@name person))
			: a -> String given a has {@name String}
	`);
	expect(result.type).toBeTruthy();

	// Function should have constraint in its type
	assertFunctionType(result.type);
	expect(result.type.constraints).toHaveLength(1);
	const firstConstraint = result.type.constraints?.[0]!;
	assertHasStructureConstraint(firstConstraint);
});

test('Structural Constraints with `has` keyword - Basic Structural Constraints - should support has constraint with multiple fields', () => {
	const result = parseAndType(`
      processUser = (fn user => concat (@firstName user) (@lastName user))
        : a -> String given a has {@firstName String, @lastName String}
    `);
	expect(result).toBeTruthy();
});

test('Structural Constraints with `has` keyword - Basic Structural Constraints - should work with record that has extra fields (duck typing)', () => {
	const result = parseAndType(`
		getName = (fn obj => @name obj) : a -> String given a has {@name String};
		result = getName {@name "Alice", @age 30, @city "NYC"}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});

test('Structural Constraints with `has` keyword - Constraint Validation - should reject record missing required field', () => {
	expect(() =>
		parseAndType(`
		getName = (fn obj => @name obj) : a -> String given a has {@name String};
		result = getName {@age 30}
	`)
	).toThrow();
});

test('Structural Constraints with `has` keyword - Constraint Validation - should reject record with wrong field type', () => {
	expect(() =>
		parseAndType(`
		getName = (fn obj => @name obj) : a -> String given a has {@name String};
		result = getName {@name 42}
	`)
	).toThrow();
});

test('Structural Constraints with `has` keyword - Constraint Validation - should validate multiple fields correctly', () => {
	const result = parseAndType(`
		processUser = (fn user => concat (@firstName user) (@lastName user))
			: a -> String given a has {@firstName String, @lastName String};
		result = processUser {@firstName "John", @lastName "Doe", @age 30}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});

test('Structural Constraints with `has` keyword - Working Examples - should work with polymorphic field types', () => {
	const result = parseAndType(`
		getItems = (fn container => @items container)
			: a -> List b given a has {@items List b}
	`);
	assertFunctionType(result.type);
	const firstConstraint = result.type.constraints?.[0]!;
	assertHasStructureConstraint(firstConstraint);
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should automatically add has constraints to accessors', () => {
	const result = parseAndType(`
		getName = @name;
		result = getName {@name "Alice", @age 30}
	`);

	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
	// The accessor should work with records that have the required field
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should reject accessor on record missing the field', () => {
	expect(() =>
		parseAndType(`
		getName = @name;
		result = getName {@age 30}
	`)
	).toThrow();
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessor on different field types', () => {
	const result = parseAndType(`
		getAge = @age;
		result = getAge {@age 30}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('Float');
	// The accessor should work with any field type
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with multiple different accessors', () => {
	const result = parseAndType(`
		getName = @name;
		getAge = @age;
		person = {@name "Alice", @age 30};
		name = getName person;
		age = getAge person
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('Float');
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessor composition', () => {
	const result = parseAndType(`
		getAddress = @address;
		getStreet = @street;
		getFullAddress = fn person => getStreet (getAddress person);
		result = getFullAddress {@address {@street "123 Main St", @city "NYC"}, @name "Alice"}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
	// Accessor composition should work correctly
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessors in function definitions', () => {
	const result = parseAndType(`
		greet = fn person => concat "Hello " (@name person);
		result = greet {@name "Alice", @occupation "Engineer"}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
	// Accessors in function bodies should work correctly
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessors and lists', () => {
	const result = parseAndType(`
		getNames = fn people => map @name people;
		people = [{@name "Alice", @age 30}, {@name "Bob", @age 25}];
		result = getNames people
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('List');
	// Mapping accessors over lists should work
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should handle accessor with polymorphic return type', () => {
	const result = parseAndType(`
		getValue = @value;
		stringValue = getValue {@value "hello"}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
	// Accessor should work with polymorphic field types
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should reject accessor on completely wrong record type', () => {
	expect(() =>
		parseAndType(`
		getName = @name;
		result = getName 42
	`)
	).toThrow();
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with nested record access', () => {
	const result = parseAndType(`
		getAddress = @address;
		getCity = @city;
		getCityFromPerson = fn person => getCity (getAddress person);
		result = getCityFromPerson {
			@name "Alice",
			@address {@street "123 Main", @city "NYC"}
		}
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
	// Nested accessor chains should work
});

test('Structural Constraints with `has` keyword - Accessor Constraints (Automatic has constraints) - should work with accessor partial application', () => {
	const result = parseAndType(`
		getName = @name;
		mapGetName = map getName;
		people = [{@name "Alice"}, {@name "Bob"}];
		result = mapGetName people
	`);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('List');
	// Partial application of accessors should work
});
