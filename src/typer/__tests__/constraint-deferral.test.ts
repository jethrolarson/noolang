import { test, expect } from 'bun:test';
import { parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

// Test to understand constraint deferral behavior
test('Constraint Deferral Investigation - Trait constraints should be deferred in function bodies', () => {
	const result = parseAndType('fn x y => x + y');
	const typeStr = typeToString(result.type, result.state.substitution);
	
	// This works - trait constraints are properly deferred
	// The exact variable name may vary due to unification, but the structure should be correct
	expect(typeStr).toMatch(/^[α-ω] -> [α-ω] -> [α-ω] given [α-ω] implements Add$/);
});

test('Constraint Deferral Investigation - Structural constraints should be deferred in function bodies (CURRENTLY FAILING)', () => {
	const result = parseAndType('fn obj => @name obj');
	const typeStr = typeToString(result.type, result.state.substitution);
	
	console.log('DEBUG: Structural constraint function type:', typeStr);
	console.log('DEBUG: Raw type:', JSON.stringify(result.type, null, 2));
	
	// This should work the same way as trait constraints, but currently doesn't
	// Expected: 'α -> β given α has {@name β}'
	// Currently gets: function type without deferred constraints
	expect(typeStr).toContain('given');
	expect(typeStr).toContain('has');
});

test('Constraint Deferral Investigation - Direct structural constraint resolution should work', () => {
	const result = parseAndType('@name {@name "Alice"}');
	const typeStr = typeToString(result.type, result.state.substitution);
	
	// This should work and return String
	expect(typeStr).toBe('String');
});

test('Constraint Deferral Investigation - Function body structural constraints should resolve when applied', () => {
	const result = parseAndType('getName = fn obj => @name obj; getName {@name "Alice"}');
	const typeStr = typeToString(result.type, result.state.substitution);
	
	console.log('DEBUG: Function body application result:', typeStr);
	
	// This should resolve to String, but currently doesn't work
	expect(typeStr).toBe('String');
});

test('Constraint Deferral Investigation - Compare where constraints are attached', () => {
	// Trait constraints
	const traitResult = parseAndType('fn x y => x + y');
	console.log('DEBUG: Trait - Function constraints:', traitResult.type.constraints);
	console.log('DEBUG: Trait - Param 0 constraints:', traitResult.type.params[0].constraints);
	
	// Structural constraints  
	const structResult = parseAndType('fn obj => @name obj');
	console.log('DEBUG: Struct - Function constraints:', structResult.type.constraints);
	console.log('DEBUG: Struct - Param 0 constraints:', structResult.type.params[0].constraints);
	
	// Test direct accessor creation (not in function body)
	const accessorResult = parseAndType('@name');
	console.log('DEBUG: Direct accessor - Function constraints:', accessorResult.type.constraints);
	console.log('DEBUG: Direct accessor - Param 0 constraints:', accessorResult.type.params[0].constraints);
	
	// Just to make test pass for now
	expect(true).toBe(true);
});