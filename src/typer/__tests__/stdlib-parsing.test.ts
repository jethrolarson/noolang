import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { loadStdlib, createTypeState } from '../type-operations';
import { initializeBuiltins } from '../builtins';
import * as fs from 'fs';
import * as path from 'path';

describe('Stdlib Parsing Regression Tests', () => {
  test('should parse the problematic implement statement from line 81', () => {
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
    expect(() => {
      const lexer = new Lexer(problematicCode);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      expect(program.statements).toBeDefined();
    }).not.toThrow();
  });

  test('should parse the full stdlib.noo file without errors', () => {
    // Test parsing the entire stdlib.noo file directly
    const stdlibPath = path.join(__dirname, '..', '..', '..', 'stdlib.noo');
    expect(fs.existsSync(stdlibPath)).toBe(true);

    const stdlibContent = fs.readFileSync(stdlibPath, 'utf-8');
    
    expect(() => {
      const lexer = new Lexer(stdlibContent);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      expect(program.statements).toBeDefined();
      expect(program.statements.length).toBeGreaterThan(0);
    }).not.toThrow();
  });

  test('should load stdlib via loadStdlib function without parse errors', () => {
    // Test the exact code path that the LSP triggers
    expect(() => {
      const initialState = createTypeState();
      const state = initializeBuiltins(initialState);
      const finalState = loadStdlib(state);
      expect(finalState).toBeDefined();
    }).not.toThrow();
  });

  test('should parse just the trait constraint syntax', () => {
    // Test the specific trait syntax that might be causing issues
    const traitCode = `
constraint Show a ( show : a -> String );
implement Show (Option a) given a implements Show (
  show = fn opt => "test"
);
    `;

    expect(() => {
      const lexer = new Lexer(traitCode);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      expect(program.statements).toBeDefined();
    }).not.toThrow();
  });

  test('should parse implement with match expression correctly', () => {
    // Test the exact pattern: implement + match that's failing
    const implementMatchCode = `
type Option a = Some a | None;
constraint Show a ( show : a -> String );

implement Show (Option a) given a implements Show (
  show = fn opt => match opt with (
    Some x => "Some value";
    None => "None"
  )
);
    `;

    expect(() => {
      const lexer = new Lexer(implementMatchCode);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      expect(program.statements).toBeDefined();
    }).not.toThrow();
  });

  test('should tokenize the problematic line correctly', () => {
    // Test tokenization of the exact line that's failing
    const line81 = 'implement Show (Option a) given a implements Show (';
    
    const lexer = new Lexer(line81);
    const tokens = lexer.tokenize();
    
    // Check that we get the expected tokens
    expect(tokens[0]).toEqual(expect.objectContaining({ type: 'KEYWORD', value: 'implement' }));
    expect(tokens[1]).toEqual(expect.objectContaining({ type: 'IDENTIFIER', value: 'Show' }));
    expect(tokens[2]).toEqual(expect.objectContaining({ type: 'PUNCTUATION', value: '(' }));
    // ... etc
    
    // Should not contain any unexpected tokens
    const unexpectedTokens = tokens.filter(t => t.type === 'UNKNOWN' || t.value === 'match');
    expect(unexpectedTokens).toHaveLength(0);
  });
});