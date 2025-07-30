import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { typeToString } from '../helpers';
import { recordType, stringType, floatType } from '../../ast';

test('Type Display (typeToString) - Record Type Display - should display record type with @field syntax', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);
	assert.is(result, '{ @name String, @age Float }');
});

test('Type Display (typeToString) - Record Type Display - should display single field record type', () => {
	const singleFieldRecord = recordType({
		name: stringType(),
	});

	const result = typeToString(singleFieldRecord);
	assert.is(result, '{ @name String }');
});

test('Type Display (typeToString) - Record Type Display - should display empty record type', () => {
	const emptyRecord = recordType({});

	const result = typeToString(emptyRecord);
	assert.is(result, '{ }');
});

test('Type Display (typeToString) - Record Type Display - should display record type with multiple fields in consistent order', () => {
	const multiFieldRecord = recordType({
		name: stringType(),
		age: floatType(),
		active: { kind: 'primitive', name: 'Bool' } as const,
	});

	const result = typeToString(multiFieldRecord);
	// Note: Object.entries() order should be consistent in modern JS
	assert.match(result, /^{ @\w+ \w+(?:, @\w+ \w+)* }$/);
	assert.ok(result.includes('@name String'));
	assert.ok(result.includes('@age Float'));
	assert.ok(result.includes('@active Bool'));
});

test('Type Display (typeToString) - Record Type Display - should display nested record types correctly', () => {
	const nestedRecord = recordType({
		person: recordType({
			name: stringType(),
			age: floatType(),
		}),
	});

	const result = typeToString(nestedRecord);
	assert.is(result, '{ @person { @name String, @age Float } }');
});

test('Type Display (typeToString) - Record Type Display Consistency - should use commas between fields', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);
	assert.ok(result.includes(', '));
});

test('Type Display (typeToString) - Record Type Display Consistency - should not use colons in field definitions', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);
	assert.ok(!result.includes(':'));
});

test('Type Display (typeToString) - Record Type Display Consistency - should use @ prefix for all field names', () => {
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
		active: { kind: 'primitive', name: 'Bool' } as const,
	});

	const result = typeToString(recordTypeWithFields);
	const fields = result.match(/@\w+/g);
	assert.is(fields?.length, 3);
	assert.ok(fields?.includes('@name'));
	assert.ok(fields?.includes('@age'));
	assert.ok(fields?.includes('@active'));
});

test('Type Display (typeToString) - Record Type Display Consistency - should match input syntax format', () => {
	// This test ensures the display format matches what users type
	const recordTypeWithFields = recordType({
		name: stringType(),
		age: floatType(),
	});

	const result = typeToString(recordTypeWithFields);

	// Should match the format: { @field Type, @field Type }
	assert.match(result, /^{ @\w+ \w+(?:, @\w+ \w+)* }$/);
});

test.run();