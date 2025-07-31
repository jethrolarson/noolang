import { describe, test, expect } from 'bun:test';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer/decoration';
import { assertFunctionType } from '../utils';

describe('Constraint inference bug tests', () => {
	test('constraint inference should be based on actual operator usage, not parameter count - FIXED', () => {
		// This test verifies the FIXED behavior
		// Functions that DO NOT use + should NOT get Add constraints

		// Case 1: Identity function - no arithmetic
		const identityCode = 'f = fn x => x';
		const identityLexer = new Lexer(identityCode);
		const identityTokens = identityLexer.tokenize();
		const identityProgram = parse(identityTokens);
		const identityTyped = typeAndDecorate(identityProgram);

		// Should be: (α) -> α  (no constraints)
		const identityType = identityTyped.type;
		expect(identityType.kind).toBe('function');
		if (identityType.kind === 'function') {
			expect(identityType.constraints?.length || 0).toBe(0); // 'Identity function should have no constraints'
		}

		// Case 2: First function - no arithmetic
		const firstCode = 'f = fn x y => x';
		const firstLexer = new Lexer(firstCode);
		const firstTokens = firstLexer.tokenize();
		const firstProgram = parse(firstTokens);
		const firstTyped = typeAndDecorate(firstProgram);

		// Should be: (α) -> (β) -> α  (no constraints)
		const firstType = firstTyped.type;
		expect(firstType.kind).toBe('function');
		if (firstType.kind === 'function') {
			expect(firstType.constraints?.length || 0).toBe(0); // 'First function should have no constraints - it does not use +'
		}

		// Case 3: Record constructor - no arithmetic
		const recordCode = 'f = fn name age => {@name name, @age age}';
		const recordLexer = new Lexer(recordCode);
		const recordTokens = recordLexer.tokenize();
		const recordProgram = parse(recordTokens);
		const recordTyped = typeAndDecorate(recordProgram);

		// Should have no Add constraints
		const recordType = recordTyped.type;
		assertFunctionType(recordType);
		expect(recordType.constraints?.length || 0).toBe(0); // 'Record constructor should have no constraints - it does not use +'
	});

	test('constraint inference should add Add constraint only when + is actually used - SKIPPED: exposes bad heuristic', () => {
		// This test currently fails because the constraint system doesn't properly
		// analyze the function body for actual + usage
		// Skip until we implement proper trait-based constraint inference

		// Functions that DO use + should get Add constraints

		const addCode = 'f = fn x y => x + y';
		const addLexer = new Lexer(addCode);
		const addTokens = addLexer.tokenize();
		const addProgram = parse(addTokens);
		const addTyped = typeAndDecorate(addProgram);

		// Should be: (α) -> (α) -> α given α implements Add
		const addType = addTyped.type;
		assertFunctionType(addType);
		expect(addType.constraints && addType.constraints.length > 0).toBeTruthy(); // 'Add function should have Add constraint'
		// Check that it has an Add constraint
		const hasAddConstraint = addType.constraints?.some(
			c => c.kind === 'implements' && c.interfaceName === 'Add'
		);
		expect(hasAddConstraint).toBeTruthy(); // 'Function using + should have Add constraint'
	});

	test('the broken heuristic incorrectly adds Add constraints based on parameter count - NOW FIXED', () => {
		// This test verifies the FIXED behavior
		// Functions that do NOT use + should NOT get Add constraints

		const wrongCode = 'f = fn x y => x'; // Does NOT use +
		const wrongLexer = new Lexer(wrongCode);
		const wrongTokens = wrongLexer.tokenize();
		const wrongProgram = parse(wrongTokens);
		const wrongTyped = typeAndDecorate(wrongProgram);

		const wrongType = wrongTyped.type;
		assertFunctionType(wrongType);

		// FIXED: No longer gets Add constraint since it doesn't use +
		const hasAddConstraint = wrongType.constraints?.some(
			c => c.kind === 'implements' && c.interfaceName === 'Add'
		);

		// This assertion verifies the FIX - it should be false and now is false
		expect(hasAddConstraint).toBeFalsy(); // 'Function not using + should not have Add constraint'
	});
}); // Close describe block
