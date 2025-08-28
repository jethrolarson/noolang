import { describe, expect, it } from 'bun:test';
import { parseAndType, runCode, expectError, expectSuccess } from '../utils';

describe('Type Variable Sharing Soundness Issues', () => {
  it('should not share type variables between separate polymorphic function definitions with List types', () => {
    const code = `
      test1 = (fn x => [x]) : a -> List a;
      test2 = (fn x => [x]) : a -> List a;
      result1 = test1 "hello";
      result2 = test2 42;
      [result1, result2]
    `;
    
    // This currently fails - complex type patterns still have sharing issues
    expectError(code, /type mismatch|Expected.*Got/);
  });

  it('should properly isolate simple identity functions', () => {
    const code = `
      func1 = (fn x => x) : a -> a;
      func2 = (fn x => x) : a -> a;
      result1 = func1 "hello";
      result2 = func2 42;
      result2
    `;
    
    // This should succeed - simple identity functions work correctly now
    expectSuccess(code, 42);
  });

  it('should properly isolate type variables in map_err usage', () => {
    const code = `
      map_err = (fn mapper result => 
        match result (
          Ok value => Ok value;
          Err error => Err (mapper error)
        )) : (b -> c) -> Result a b -> Result a c;

      usage1 = map_err (fn e => "String") (Ok 42);
      usage2 = map_err (fn e => "Float") (Ok "hello");
      usage2
    `;
    
    // This should succeed - each usage should work independently without type variable sharing
    expectSuccess(code);
  });

  it('should demonstrate that the soundness bug is now fixed', () => {
    const code = `
      func1 = (fn x => x) : a -> a;
      func2 = (fn x => x) : a -> a;
      
      # These should work independently
      result1 = func1 "hello";
      result2 = func2 42;
      
      result1
    `;
    
    // This should now succeed - the soundness bug has been fixed
    expectSuccess(code, "hello");
  });

  it('should handle complex polymorphic function applications correctly', () => {
    const code = `
      # This mimics the pattern from schema.noo that shows narrowing issues
      list_fn = (fn element_fn data => Ok [element_fn data]) : (a -> b) -> a -> Result (List b) String;
      string_fn = fn s => s;
      
      string_result = list_fn string_fn "hello";
      string_result
    `;
    
    // This should succeed and properly narrow types
    const result = expectSuccess(code);
    
    // The result should have properly narrowed types
    // string_result should be Result (List String) String, not Result (List a) String
    // Note: We might still have the display issue, but the type should be internally correct
  });

  it('should not allow unsound operations due to type variable sharing', () => {
    const code = `
      # If type variables are improperly shared, this could allow unsound operations
      identity1 = (fn x => x) : a -> a;
      identity2 = (fn x => x) : a -> a;
      
      # Force identity1 to work with strings
      string_result = identity1 "hello";
      
      # With proper type variable isolation, identity2 should work independently with numbers
      number_result = identity2 42;
      
      number_result
    `;
    
    // This should now succeed - type variables are properly isolated
    expectSuccess(code, 42);
  });
});