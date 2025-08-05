import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from 'bun:test';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { createTypeState } from '../type-operations';
import { initializeBuiltins } from '../builtins';

test('Stdlib Parsing Regression Tests - should parse the problematic implement statement from line 81', () => {
	// Isolate the exact code that's failing from around line 81
	const problematicCode = `
variant Option a = Some a | None;

implement Show (Option a) given a implements Show (
  show = fn opt => match opt with (
    Some x => concat "Some(" (concat (show x) ")");
    None => "None"
  )
);
    `;

	// This should not throw a parse error
	const lexer = new Lexer(problematicCode);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements).toBeTruthy();
});

test('Stdlib Parsing Regression Tests - should handle another complex implement statement', () => {
	const complexCode = `
variant List a = Nil | Cons a (List a);

implement Functor List (
  map = fn f list => match list with (
    Nil => Nil;
    Cons head tail => Cons (f head) (map f tail)
  )
);
    `;

	const lexer = new Lexer(complexCode);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements).toBeTruthy();
	expect(program.statements.length).toBe(1);
});

test('Stdlib Parsing Regression Tests - should parse simple variant definition', () => {
	const simpleCode = `
variant Option a = Some a | None;
    `;

	const lexer = new Lexer(simpleCode);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements).toBeTruthy();
	expect(program.statements.length).toBe(1);
});

test('Stdlib Parsing Regression Tests - should parse stdlib without errors', () => {
	// Read the actual stdlib file
	const stdlibPath = path.join(__dirname, '../../../stdlib.noo');

	const stdlibContent = fs.readFileSync(stdlibPath, 'utf8');

	// This should not throw
	const lexer = new Lexer(stdlibContent);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	expect(program.statements).toBeTruthy();

	// Should have multiple statements
	expect(program.statements.length > 0).toBeTruthy();
});

test('Stdlib Parsing Regression Tests - should handle variant state initialization', () => {
	const typeState = createTypeState();
	initializeBuiltins(typeState);

	// Should have initialized type state
	expect(typeState).toBeTruthy();
	expect(typeState.substitution !== undefined).toBeTruthy();
});
