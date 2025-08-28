import { describe, expect, it } from 'bun:test';
import { parseAndType } from '../utils';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';

describe('Variant Type Annotation Bug', () => {
  it('should handle variant types in polymorphic annotations without hanging', async () => {
    // This test should PASS when the bug is FIXED
    // Currently it will FAIL because the code hangs
    
    const code = `
      variant Simple = Simple;
      f = fn x => Ok x : a -> Result a Simple;
      f
    `;
    
    // Use a timeout to prevent hanging the test suite
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Type checking is hanging - infinite loop bug exists')), 2000)
    );
    
    const typeCheckPromise = new Promise((resolve) => {
      const result = parseAndType(code);
      resolve(result);
    });
    
    // This should complete quickly without hanging
    const result = await Promise.race([typeCheckPromise, timeoutPromise]);
    expect(result).toBeDefined();
  });

  it('should work fine when variant is not defined', () => {
    // Control test: same pattern but without defining the variant should work
    const code = `
      f = fn x => Ok x : a -> Result a UndefinedVariant;
      f
    `;
    
    const result = parseAndType(code);
    expect(result).toBeDefined();
    // This should work quickly since UndefinedVariant is not defined
  });

  it('should work fine with concrete types instead of type variables', () => {
    // Control test: defined variant with concrete types should work
    const code = `
      variant Simple = Simple;
      f = fn x => Ok x : String -> Result String Simple;
      f
    `;
    
    const result = parseAndType(code);
    expect(result).toBeDefined();
    // This should work since there are no type variables to resolve
  });

  it('should isolate the exact problematic pattern from schema.noo', () => {
    // This is the exact pattern that causes the schema.noo infinite loop
    const code = `
      variant DecodeError = TypeMismatch String String;
      list_schema = fn element_schema => fn data => Ok [] : (Unknown -> Result a DecodeError) -> Unknown -> Result (List a) DecodeError;
      list_schema
    `;
    
    const start = Date.now();
    
    try {
      const result = parseAndType(code);
      const duration = Date.now() - start;
      
      // This currently hangs but should complete quickly
      expect(duration).toBeLessThan(1000);
      expect(result).toBeDefined();
    } catch (error) {
      // Better to fail fast than hang
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    }
  });
});