import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { typeAndDecorate } from '../decoration';
import * as fs from 'fs';
import * as path from 'path';

describe('LSP Regression Tests', () => {
  test('should reproduce the exact LSP --types-file code path', () => {
    // Simulate exactly what the LSP does when calling --types-file
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    expect(fs.existsSync(basicNooPath)).toBe(true);

    expect(() => {
      // This is the exact code from CLI --types-file
      const fullPath = path.resolve(basicNooPath);
      const code = fs.readFileSync(fullPath, 'utf8');
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      // This is where the error occurs - typeAndDecorate calls loadStdlib
      const { program: decoratedProgram, state } = typeAndDecorate(program);
      
      expect(decoratedProgram).toBeDefined();
      expect(state).toBeDefined();
    }).not.toThrow();
  });

  test('should handle multiple calls to typeAndDecorate', () => {
    // Test if there's an issue with repeated calls (LSP scenario)
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    const code = fs.readFileSync(basicNooPath, 'utf8');
    
    expect(() => {
      // Call multiple times like LSP might do
      for (let i = 0; i < 3; i++) {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const program = parse(tokens);
        const { program: decoratedProgram } = typeAndDecorate(program);
        expect(decoratedProgram).toBeDefined();
      }
    }).not.toThrow();
  });

  test('should handle concurrent typeAndDecorate calls', async () => {
    // Test if there's a race condition
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    const code = fs.readFileSync(basicNooPath, 'utf8');
    
    const promises = Array(5).fill(0).map(async () => {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      return typeAndDecorate(program);
    });

    expect(async () => {
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.program).toBeDefined();
        expect(result.state).toBeDefined();
      });
    }).not.toThrow();
  });

  test('should handle typeAndDecorate with empty initial state', () => {
    // Test with different initial state scenarios
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    const code = fs.readFileSync(basicNooPath, 'utf8');
    
    expect(() => {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      // Call with undefined initial state (forces stdlib loading)
      const { program: decoratedProgram } = typeAndDecorate(program, undefined);
      expect(decoratedProgram).toBeDefined();
    }).not.toThrow();
  });

  test('should isolate stdlib loading error with specific line tracking', () => {
    // Try to catch the exact line where the error occurs
    const basicNooPath = path.join(__dirname, '..', '..', '..', 'examples', 'basic.noo');
    
    try {
      const fullPath = path.resolve(basicNooPath);
      const code = fs.readFileSync(fullPath, 'utf8');
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const program = parse(tokens);
      
      // This should trigger the stdlib loading and potential error
      const { program: decoratedProgram } = typeAndDecorate(program);
      
      expect(decoratedProgram).toBeDefined();
    } catch (error) {
      // If there IS an error, let's analyze it
      const errorMessage = (error as Error).message;
      console.log('Caught error:', errorMessage);
      
      // Check if it's the specific line 81 error
      if (errorMessage.includes('line 81') || errorMessage.includes('Expected KEYWORD \'match\'')) {
        console.log('Reproduced the LSP regression error!');
        console.log('Error details:', error);
      }
      
      // Re-throw to fail the test and show us what happened
      throw error;
    }
  });
});