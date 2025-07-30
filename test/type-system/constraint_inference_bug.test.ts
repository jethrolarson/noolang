import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';

test('constraint inference should be based on actual operator usage, not parameter count', () => {
	// Functions that DO NOT use + should NOT get Add constraints
	
	// Case 1: Identity function - no arithmetic
	const identityCode = 'f = fn x => x';
	const identityLexer = new Lexer(identityCode);
	const identityTokens = identityLexer.tokenize();
	const identityProgram = parse(identityTokens);
	const identityTyped = typeAndDecorate(identityProgram);
	
	// Should be: (α) -> α  (no constraints)
	const identityType = identityTyped.finalType;
	assert.equal(identityType.kind, 'function');
	assert.equal(identityType.constraints?.length || 0, 0, 'Identity function should have no constraints');
	
	// Case 2: First function - no arithmetic  
	const firstCode = 'f = fn x y => x';
	const firstLexer = new Lexer(firstCode);
	const firstTokens = firstLexer.tokenize();
	const firstProgram = parse(firstTokens);
	const firstTyped = typeAndDecorate(firstProgram);
	
	// Should be: (α) -> (β) -> α  (no constraints)
	const firstType = firstTyped.finalType;
	assert.equal(firstType.kind, 'function');
	assert.equal(firstType.constraints?.length || 0, 0, 'First function should have no constraints - it does not use +');
	
	// Case 3: Record constructor - no arithmetic
	const recordCode = 'f = fn name age => {@name name, @age age}';
	const recordLexer = new Lexer(recordCode);
	const recordTokens = recordLexer.tokenize();
	const recordProgram = parse(recordTokens);
	const recordTyped = typeAndDecorate(recordProgram);
	
	// Should have no Add constraints
	const recordType = recordTyped.finalType;
	assert.equal(recordType.kind, 'function');
	assert.equal(recordType.constraints?.length || 0, 0, 'Record constructor should have no constraints - it does not use +');
});

test('constraint inference should add Add constraint only when + is actually used', () => {
	// Functions that DO use + should get Add constraints
	
	const addCode = 'f = fn x y => x + y';
	const addLexer = new Lexer(addCode);
	const addTokens = addLexer.tokenize();
	const addProgram = parse(addTokens);
	const addTyped = typeAndDecorate(addProgram);
	
	// Should be: (α) -> (α) -> α given α implements Add
	const addType = addTyped.finalType;
	assert.equal(addType.kind, 'function');
	assert.ok(addType.constraints && addType.constraints.length > 0, 'Add function should have Add constraint');
	
	// Check that it has an Add constraint
	const hasAddConstraint = addType.constraints?.some(c => 
		c.kind === 'implements' && c.trait === 'Add'
	);
	assert.ok(hasAddConstraint, 'Function using + should have Add constraint');
});

test('the broken heuristic incorrectly adds Add constraints based on parameter count', () => {
	// This test documents the current WRONG behavior
	// It should FAIL once we fix the constraint inference
	
	const wrongCode = 'f = fn x y => x';  // Does NOT use +
	const wrongLexer = new Lexer(wrongCode);
	const wrongTokens = wrongLexer.tokenize();
	const wrongProgram = parse(wrongTokens);
	const wrongTyped = typeAndDecorate(wrongProgram);
	
	const wrongType = wrongTyped.finalType;
	assert.equal(wrongType.kind, 'function');
	
	// Currently this INCORRECTLY has Add constraint due to broken heuristic
	const hasAddConstraint = wrongType.constraints?.some(c => 
		c.kind === 'implements' && c.trait === 'Add'
	);
	
	// This assertion documents the BUG - it should be false but is currently true
	assert.ok(hasAddConstraint, 'BUG: Function not using + incorrectly gets Add constraint due to broken heuristic');
	
	// TODO: When we fix constraint inference, this test should be updated to:
	// assert.not.ok(hasAddConstraint, 'Function not using + should not have Add constraint');
});