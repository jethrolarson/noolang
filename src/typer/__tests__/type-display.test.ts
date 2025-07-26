import { typeToString } from '../helpers';
import { recordType, stringType, intType } from '../../ast';

describe('Type Display (typeToString)', () => {
	describe('Record Type Display', () => {
		test('should display record type with @field syntax', () => {
			const recordTypeWithFields = recordType({
				name: stringType(),
				age: intType()
			});
			
			const result = typeToString(recordTypeWithFields);
			expect(result).toBe('{ @name String, @age Int }');
		});

		test('should display single field record type', () => {
			const singleFieldRecord = recordType({
				name: stringType()
			});
			
			const result = typeToString(singleFieldRecord);
			expect(result).toBe('{ @name String }');
		});

		test('should display empty record type', () => {
			const emptyRecord = recordType({});
			
			const result = typeToString(emptyRecord);
			expect(result).toBe('{ }');
		});

		test('should display record type with multiple fields in consistent order', () => {
			const multiFieldRecord = recordType({
				name: stringType(),
				age: intType(),
				active: { kind: 'primitive', name: 'Bool' } as const
			});
			
			const result = typeToString(multiFieldRecord);
			// Note: Object.entries() order should be consistent in modern JS
			expect(result).toMatch(/^{ @\w+ \w+(?:, @\w+ \w+)* }$/);
			expect(result).toContain('@name String');
			expect(result).toContain('@age Int');
			expect(result).toContain('@active Bool');
		});

		test('should display nested record types correctly', () => {
			const nestedRecord = recordType({
				person: recordType({
					name: stringType(),
					age: intType()
				})
			});
			
			const result = typeToString(nestedRecord);
			expect(result).toBe('{ @person { @name String, @age Int } }');
		});
	});

	describe('Record Type Display Consistency', () => {
		test('should use commas between fields', () => {
			const recordTypeWithFields = recordType({
				name: stringType(),
				age: intType()
			});
			
			const result = typeToString(recordTypeWithFields);
			expect(result).toContain(', ');
		});

		test('should not use colons in field definitions', () => {
			const recordTypeWithFields = recordType({
				name: stringType(),
				age: intType()
			});
			
			const result = typeToString(recordTypeWithFields);
			expect(result).not.toContain(':');
		});

		test('should use @ prefix for all field names', () => {
			const recordTypeWithFields = recordType({
				name: stringType(),
				age: intType(),
				active: { kind: 'primitive', name: 'Bool' } as const
			});
			
			const result = typeToString(recordTypeWithFields);
			const fields = result.match(/@\w+/g);
			expect(fields).toHaveLength(3);
			expect(fields).toContain('@name');
			expect(fields).toContain('@age');
			expect(fields).toContain('@active');
		});

		test('should match input syntax format', () => {
			// This test ensures the display format matches what users type
			const recordTypeWithFields = recordType({
				name: stringType(),
				age: intType()
			});
			
			const result = typeToString(recordTypeWithFields);
			
			// Should match the format: { @field Type, @field Type }
			expect(result).toMatch(/^{ @\w+ \w+(?:, @\w+ \w+)* }$/);
		});
	});
});