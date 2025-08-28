import { describe, expect, it } from 'bun:test';
import { runCode } from '../utils';

describe('Type Narrowing Issues', () => {
  it('should document the schema.noo type narrowing issue', () => {
    // This test documents the core issue: polymorphic function application
    // doesn't narrow the result type properly for display
    
    const code = `
      string_schema = fn s => s : String -> String;
      list_schema = fn element_schema => fn data => Ok [element_schema data] : (a -> b) -> a -> Result (List b) String;
      
      # This executes fine but the displayed type is wrong:
      # Current: Result List a String  
      # Should be: Result List String String
      result = list_schema string_schema "test";
      result
    `;
    
    const result = runCode(code);
    
    // Execution works correctly
    expect(result.finalValue).toBeDefined();
    
    // The issue is purely in type narrowing/display
    // When you run: bun start schema.noo --type
    // You get: Result List a DecodeError
    // But it should show: Result List String DecodeError
  });

  it('should show that polymorphic functions work independently now', () => {
    // This test shows that the type variable sharing bug is fixed
    const code = `
      id1 = fn x => x : a -> a;
      id2 = fn x => x : a -> a;
      
      # These work independently without type variable sharing
      result1 = id1 "hello";
      result2 = id2 42;
      result1
    `;
    
    const result = runCode(code);
    expect(result.finalValue).toBe("hello");
  });

  it('should demonstrate that complex cases still need type narrowing work', () => {
    const code = `
      # These work at runtime but types aren't narrowed for display
      identity = fn x => x : a -> a;
      wrap_in_list = fn x => [x] : a -> List a; 
      
      str_result = identity "hello";
      list_result = wrap_in_list str_result;
      list_result
    `;
    
    const result = runCode(code);
    expect(result.finalValue).toEqual(["hello"]);
    
    // The type narrowing issue is that when these are displayed,
    // the types still show type variables instead of concrete types
  });
});