import { describe, test, expect } from 'bun:test';
import assert from 'node:assert';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer/decoration';
import { assertFunctionType, assertImplementsConstraint } from '../utils';

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

		// Should be: (a) -> a  (no constraints)
		const identityType = identityTyped.type;
		assertFunctionType(identityType);
		expect(identityType.constraints).toBeUndefined(); // 'Identity function should have no constraints'

		// Case 2: First function - no arithmetic
		const firstCode = 'f = fn x y => x';
		const firstLexer = new Lexer(firstCode);
		const firstTokens = firstLexer.tokenize();
		const firstProgram = parse(firstTokens);
		const firstTyped = typeAndDecorate(firstProgram);

		// Should be: (a) -> (b) -> a  (no constraints)
		const firstType = firstTyped.type;
		assertFunctionType(firstType);
		expect(firstType.constraints).toBeUndefined(); // 'First function should have no constraints - it does not use +'

		// Case 3: Record constructor - no arithmetic
		const recordCode = 'f = fn name age => {@name name, @age age}';
		const recordLexer = new Lexer(recordCode);
		const recordTokens = recordLexer.tokenize();
		const recordProgram = parse(recordTokens);
		const recordTyped = typeAndDecorate(recordProgram);

		// Should have no Add constraints
		const recordType = recordTyped.type;
		assertFunctionType(recordType);
		expect(recordType.constraints).toBeUndefined(); // 'Record constructor should have no constraints - it does not use +'
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

		// Should be: (a) -> (a) -> a given a implements Add
		const addType = addTyped.type;
		assertFunctionType(addType);
		assert(addType.constraints?.[0]);
		assertImplementsConstraint(addType.constraints[0]);
		expect(addType.constraints[0].interfaceName).toBe('Add');
	});

	test('free type variables should not have constraints', () => {
		const wrongCode = 'f = fn x y => x';
		const wrongLexer = new Lexer(wrongCode);
		const wrongTokens = wrongLexer.tokenize();
		const wrongProgram = parse(wrongTokens);
		const wrongTyped = typeAndDecorate(wrongProgram);
		const wrongType = wrongTyped.type;
		assertFunctionType(wrongType);
		expect(wrongType.constraints).toBeUndefined();
	});
});
