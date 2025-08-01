import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { loadStdlib, createTypeState } from '../type-operations';
import { initializeBuiltins } from '../builtins';
import * as fs from 'fs';
import * as path from 'path';

test('Stdlib Parsing Regression Tests - should parse the problematic implement statement from line 81', () => {
  // Isolate the exact code that's failing from around line 81
  const problematicCode = `
type Option a = Some a | None;

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
  assert.ok(program.statements);
});

test('Stdlib Parsing Regression Tests - should handle another complex implement statement', () => {
  const complexCode = `
type List a = Nil | Cons a (List a);

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
  assert.ok(program.statements);
  assert.is(program.statements.length, 1);
});

test('Stdlib Parsing Regression Tests - should parse simple type definition', () => {
  const simpleCode = `
type Option a = Some a | None;
    `;

  const lexer = new Lexer(simpleCode);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  assert.ok(program.statements);
  assert.is(program.statements.length, 1);
});

test('Stdlib Parsing Regression Tests - should parse stdlib without errors', () => {
  // Read the actual stdlib file
  const stdlibPath = path.join(__dirname, '../../../stdlib.noo');
  
  let stdlibExists = false;
  try {
    const stdlibContent = fs.readFileSync(stdlibPath, 'utf8');
    stdlibExists = true;
    
    // This should not throw
    const lexer = new Lexer(stdlibContent);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    assert.ok(program.statements);
    
    // Should have multiple statements
    assert.ok(program.statements.length > 0);
  } catch (error) {
    if (!stdlibExists) {
      // Skip this test if stdlib doesn't exist
      console.log('Skipping stdlib parsing test - file not found');
      return;
    }
    throw error;
  }
});

test('Stdlib Parsing Regression Tests - should handle type state initialization', () => {
  const typeState = createTypeState();
  initializeBuiltins(typeState);
  
  // Should have initialized type state
  assert.ok(typeState);
  assert.ok(typeState.substitution !== undefined);
});

test.run();