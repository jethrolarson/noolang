import { test, expect } from 'bun:test';
import {
	assertFunctionType,
	assertHasStructureConstraint,
	assertListType,
	assertPrimitiveType,
	assertVariableType,
	assertRecordType,
	parseAndType,
	assertStructureFieldType,
} from '../../../test/utils';
import type { RecordType } from '../../ast';

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
		getName {@name "Alice", @age 30}
	`);

	console.log(
		'DEBUG: Final result type:',
		JSON.stringify(result.type, null, 2)
	);
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
	console.log(
		'DEBUG: Composition test result type:',
		JSON.stringify(result.type, null, 2)
	);
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
	console.log(
		'DEBUG: List test result type:',
		JSON.stringify(result.type, null, 2)
	);
	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toBe('String');
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
	console.log(
		'DEBUG: Partial application result:',
		JSON.stringify(result.type, null, 2)
	);
	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toBe('String');
	// Partial application of accessors should work
});

test('Structural Constraints with `has` keyword - Pipeline Operator Composition - should correctly compose accessors with <| operator', () => {
	// @city <| @person should be equivalent to fn s => (@city (@person s))
	// This should have type: a -> y given a has {@person b} and b has {@city y}
	const result = parseAndType('@city <| @person');
	console.log(
		'DEBUG: Pipeline composition result:',
		JSON.stringify(result.type, null, 2)
	);

	// Should be a function type
	assertFunctionType(result.type);

	// Test the actual type structure directly
	const functionType = result.type;

	// Should have exactly one parameter
	expect(functionType.params).toHaveLength(1);

	// Parameter should be a variable type with constraints
	const param = functionType.params[0];
	assertVariableType(param);
	expect(param.constraints).toHaveLength(1);
	assertHasStructureConstraint(param.constraints![0]);

	// Check the person constraint structure
	const personConstraint = param.constraints![0];
	expect(personConstraint.structure.fields).toHaveProperty('person');

	// Function should have constraints for the nested @city access
	expect(functionType.constraints).toHaveLength(1);
	assertHasStructureConstraint(functionType.constraints![0]);

	// Check the city constraint structure
	const cityConstraint = functionType.constraints![0];
	expect(cityConstraint.structure.fields).toHaveProperty('city');

	// The city constraint should reference the person field's type variable
	// This ensures the nested relationship: person field has city field
	const personFieldType = personConstraint.structure.fields.person;
	// For simple field accessors, we expect regular types, not nested structures
	assertStructureFieldType(personFieldType);
	assertVariableType(personFieldType);
	expect(cityConstraint.typeVar).toBe(personFieldType.name);

	// Return type should be the city field's type
	assertVariableType(functionType.return);
	const cityFieldType = cityConstraint.structure.fields.city;
	assertStructureFieldType(cityFieldType);
	assertVariableType(cityFieldType);
	expect(functionType.return.name).toBe(cityFieldType.name);
});

test('Structural Constraints with `has` keyword - Nested Structure Fields - should handle complex nested relationships correctly', () => {
	// Test a case with nested structure fields: a has {@user {@name String, @age Float}}
	const result = parseAndType(`
		getUserName = (fn obj => @name (@user obj))
			: a -> String given a has {@user {@name String, @age Float}}
	`);

	assertFunctionType(result.type);
	const functionType = result.type;

	// Should have exactly one parameter
	expect(functionType.params).toHaveLength(1);

	// Parameter should be a variable type with constraints
	const param = functionType.params[0];
	assertVariableType(param);
	expect(param.constraints).toHaveLength(1);
	assertHasStructureConstraint(param.constraints![0]);

	// Check the parameter constraint - the user field is a variable type with nested constraints
	const paramConstraint = param.constraints![0];
	expect(paramConstraint.structure.fields).toHaveProperty('user');

	const userFieldInParam = paramConstraint.structure.fields.user;
	assertStructureFieldType(userFieldInParam);
	assertVariableType(userFieldInParam);

	// The user field should have its own constraints (nested constraint structure)
	expect(userFieldInParam.constraints).toHaveLength(1);
	assertHasStructureConstraint(userFieldInParam.constraints![0]);

	const nestedConstraint = userFieldInParam.constraints![0];
	expect(nestedConstraint.structure.fields).toHaveProperty('name');

	// The nested name field should be a simple type
	const nameField = nestedConstraint.structure.fields.name;
	assertStructureFieldType(nameField);
	assertVariableType(nameField);
	expect(nameField.name).toBe('String');

	// Check the function constraint - the user field here is a record type with the actual structure
	expect(functionType.constraints).toHaveLength(1);
	assertHasStructureConstraint(functionType.constraints![0]);

	const functionConstraint = functionType.constraints![0];
	expect(functionConstraint.structure.fields).toHaveProperty('user');

	const userFieldInFunction = functionConstraint.structure.fields.user;
	assertStructureFieldType(userFieldInFunction);
	assertRecordType(userFieldInFunction);

	// Cast to RecordType after assertion
	const userRecord = userFieldInFunction as RecordType;

	// Check that the record has the expected fields
	expect(userRecord.fields).toHaveProperty('name');
	expect(userRecord.fields).toHaveProperty('age');

	// The fields should be primitive types
	assertPrimitiveType(userRecord.fields.name);
	assertPrimitiveType(userRecord.fields.age);

	expect(userRecord.fields.name.name).toBe('String');
	expect(userRecord.fields.age.name).toBe('Float');
});
