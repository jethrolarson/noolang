import { typeToString } from '../helpers';
import { recordType, stringType, floatType } from '../../ast';
import { test, expect } from 'bun:test';

test('Type Display (typeToString) - Record Type Display - should display record type with @field syntax', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);
	expect(result).toBe('{ @name String, @age Float }');
});

test('Type Display (typeToString) - Record Type Display - should display single field record type', () => {
	const singleFieldRecord = recordType({
		name: stringType(),
	});

	const result = typeToString(singleFieldRecord);
	expect(result).toBe('{ @name String }');
});

test('Type Display (typeToString) - Record Type Display - should display empty record type', () => {
	const emptyRecord = recordType({});

	const result = typeToString(emptyRecord);
	expect(result).toBe('{ }');
});

test('Type Display (typeToString) - Record Type Display - should display record type with multiple fields in consistent order', () => {
	const multiFieldRecord = recordType({
		name: stringType(),
		age: floatType(),
		active: { kind: 'primitive', name: 'Bool' } as const,
	});

	const result = typeToString(multiFieldRecord);
	// Note: Object.entries() order should be consistent in modern JS
	expect(result).toMatch(/^{ @\w+ \w+(?:, @\w+ \w+)* }$/);
	expect(result.includes('@name String')).toBeTruthy();
	expect(result.includes('@age Float')).toBeTruthy();
	expect(result.includes('@active Bool')).toBeTruthy();
});

test('Type Display (typeToString) - Record Type Display - should display nested record types correctly', () => {
	const nestedRecord = recordType({
		person: recordType({
			name: stringType(),
			age: floatType(),
		}),
	});

	const result = typeToString(nestedRecord);
	expect(result).toBe('{ @person { @name String, @age Float } }');
});

test('Type Display (typeToString) - Record Type Display Consistency - should use commas between fields', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);
	expect(result.includes(', ')).toBeTruthy();
});

test('Type Display (typeToString) - Record Type Display Consistency - should not use colons in field definitions', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);
	expect(!result.includes(':')).toBeTruthy();
});

test('Type Display (typeToString) - Record Type Display Consistency - should use @ prefix for all field names', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
		active: { kind: 'primitive', name: 'Bool' } as const,
	});

	const result = typeToString(recordTypeWithFields);
	const fields = result.match(/@\w+/g);
	expect(fields?.length).toBe(3);
	expect(fields?.includes('@name')).toBeTruthy();
	expect(fields?.includes('@age')).toBeTruthy();
	expect(fields?.includes('@active')).toBeTruthy();
});

test('Type Display (typeToString) - Record Type Display Consistency - should match input syntax format', () => {
	// This test ensures the display format matches what users type
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);

	// Should match the format: { @field Type, @field Type }
	expect(result).toMatch(/^{ @\w+ \w+(?:, @\w+ \w+)* }$/);
});

