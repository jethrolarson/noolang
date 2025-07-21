import { REPL } from '../src/repl';
import { Evaluator } from '../src/evaluator';
import { createTypeState } from '../src/typer/type-operations';

// Mock readline to test REPL without requiring user input
jest.mock('node:readline', () => ({
  createInterface: jest.fn(() => ({
    prompt: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock console.log to capture output
const originalLog = console.log;
const originalError = console.error;
let logOutput: string[] = [];
let errorOutput: string[] = [];

beforeEach(() => {
  logOutput = [];
  errorOutput = [];
  console.log = jest.fn((...args) => {
    logOutput.push(args.join(' '));
  });
  console.error = jest.fn((...args) => {
    errorOutput.push(args.join(' '));
  });
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

// Helper class to test REPL without readline interface
class TestableREPL extends REPL {
  // Expose private method for testing
  public testProcessInput(input: string): void {
    // @ts-ignore - accessing private method for testing
    this.processInput(input);
  }

  // Expose private method for testing commands
  public testHandleCommand(input: string): void {
    // @ts-ignore - accessing private method for testing
    this.handleCommand(input);
  }

  // Get evaluator for state inspection
  public getEvaluator(): Evaluator {
    // @ts-ignore - accessing private property for testing
    return this.evaluator;
  }

  // Get type state for inspection
  public getTypeState(): any {
    // @ts-ignore - accessing private property for testing
    return this.typeState;
  }
}

describe('REPL Automated Tests', () => {
  let repl: TestableREPL;

  beforeEach(() => {
    repl = new TestableREPL();
  });

  describe('Basic Expression Evaluation', () => {
    test('should evaluate simple arithmetic expressions', () => {
      repl.testProcessInput('1 + 2');
      
      expect(logOutput.some(line => line.includes('3'))).toBe(true);
      expect(logOutput.some(line => line.includes('Int'))).toBe(true);
    });

    test('should evaluate string expressions', () => {
      repl.testProcessInput('"hello world"');
      
      expect(logOutput.some(line => line.includes('hello world'))).toBe(true);
      expect(logOutput.some(line => line.includes('String'))).toBe(true);
    });

    test('should evaluate boolean expressions', () => {
      repl.testProcessInput('true');
      
      expect(logOutput.some(line => line.includes('true'))).toBe(true);
      expect(logOutput.some(line => line.includes('Bool'))).toBe(true);
    });

    test('should evaluate list expressions', () => {
      repl.testProcessInput('[1, 2, 3]');
      
      expect(logOutput.some(line => line.includes('[1, 2, 3]'))).toBe(true);
    });

    test('should evaluate function definitions and applications', () => {
      // Define a function
      repl.testProcessInput('add = fn x y => x + y');
      
      // Apply the function
      logOutput = []; // Clear previous output
      repl.testProcessInput('add 2 3');
      
      expect(logOutput.some(line => line.includes('5'))).toBe(true);
    });
  });

  describe('State Persistence', () => {
    test('should maintain variable definitions between inputs', () => {
      // Define a variable
      repl.testProcessInput('x = 42');
      
      // Use the variable in next input
      logOutput = [];
      repl.testProcessInput('x + 8');
      
      expect(logOutput.some(line => line.includes('50'))).toBe(true);
    });

    test('should maintain function definitions between inputs', () => {
      // Define a function
      repl.testProcessInput('double = fn x => x * 2');
      
      // Use the function in next input
      logOutput = [];
      repl.testProcessInput('double 21');
      
      expect(logOutput.some(line => line.includes('42'))).toBe(true);
    });

    test('should handle polymorphic functions correctly across inputs', () => {
      // Use print with integer
      repl.testProcessInput('print 42');
      expect(errorOutput.length).toBe(0);
      
      // Use print with string - should not cause type pollution
      errorOutput = [];
      repl.testProcessInput('print "hello"');
      expect(errorOutput.length).toBe(0);
      
      // Use print with integer again
      errorOutput = [];
      repl.testProcessInput('print 100');
      expect(errorOutput.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle syntax errors gracefully', () => {
      repl.testProcessInput('1 + + 2');
      
      expect(errorOutput.some(line => line.includes('Error'))).toBe(true);
    });

    test('should handle type errors gracefully', () => {
      repl.testProcessInput('1 + "hello"');
      
      expect(errorOutput.some(line => line.includes('Error') || line.includes('TypeError'))).toBe(true);
    });

    test('should handle undefined variable errors', () => {
      repl.testProcessInput('undefined_variable');
      
      expect(errorOutput.some(line => line.includes('Error'))).toBe(true);
    });

    test('should continue functioning after errors', () => {
      // Cause an error
      repl.testProcessInput('1 + "hello"');
      expect(errorOutput.length).toBeGreaterThan(0);
      
      // Should still work after error
      errorOutput = [];
      logOutput = [];
      repl.testProcessInput('2 + 3');
      
      expect(logOutput.some(line => line.includes('5'))).toBe(true);
      expect(errorOutput.length).toBe(0);
    });
  });

  describe('REPL Commands', () => {
    test('should handle .help command', () => {
      repl.testHandleCommand('.help');
      
      expect(logOutput.some(line => line.includes('Noolang REPL Commands'))).toBe(true);
      expect(logOutput.some(line => line.includes('.quit'))).toBe(true);
      expect(logOutput.some(line => line.includes('.env'))).toBe(true);
    });

    test('should handle .env command', () => {
      // Define some variables first
      repl.testProcessInput('x = 42');
      repl.testProcessInput('y = "hello"');
      
      logOutput = [];
      repl.testHandleCommand('.env');
      
      expect(logOutput.some(line => line.includes('Current Environment'))).toBe(true);
      expect(logOutput.some(line => line.includes('x') && line.includes('42'))).toBe(true);
      expect(logOutput.some(line => line.includes('y') && line.includes('hello'))).toBe(true);
    });

    test('should handle .tokens command', () => {
      repl.testHandleCommand('.tokens (1 + 2)');
      
      expect(logOutput.some(line => line.includes('Tokens for'))).toBe(true);
      expect(logOutput.some(line => line.includes('NUMBER'))).toBe(true);
      expect(logOutput.some(line => line.includes('PLUS'))).toBe(true);
    });

    test('should handle .ast command', () => {
      repl.testHandleCommand('.ast (1 + 2)');
      
      expect(logOutput.some(line => line.includes('AST for'))).toBe(true);
      expect(logOutput.some(line => line.includes('Binary'))).toBe(true);
    });

    test('should handle .ast-json command', () => {
      repl.testHandleCommand('.ast-json (42)');
      
      expect(logOutput.some(line => line.includes('"kind"'))).toBe(true);
      expect(logOutput.some(line => line.includes('"literal"'))).toBe(true);
    });

    test('should handle .clear-env command', () => {
      // Define a variable
      repl.testProcessInput('x = 42');
      
      // Clear environment
      logOutput = [];
      repl.testHandleCommand('.clear-env');
      
      expect(logOutput.some(line => line.includes('Environment cleared'))).toBe(true);
      
      // Variable should no longer be accessible
      errorOutput = [];
      repl.testProcessInput('x');
      expect(errorOutput.some(line => line.includes('Error'))).toBe(true);
    });

    test('should handle unknown commands gracefully', () => {
      repl.testHandleCommand('.unknown');
      
      expect(logOutput.some(line => line.includes('Unknown command'))).toBe(true);
      expect(logOutput.some(line => line.includes('.help'))).toBe(true);
    });
  });

  describe('Complex Interactive Scenarios', () => {
    test('should handle complex function composition', () => {
      repl.testProcessInput('compose = fn f g => fn x => f (g x)');
      repl.testProcessInput('double = fn x => x * 2');
      repl.testProcessInput('increment = fn x => x + 1');
      
      logOutput = [];
      repl.testProcessInput('(compose double increment) 5');
      
      expect(logOutput.some(line => line.includes('12'))).toBe(true); // (5 + 1) * 2 = 12
    });

    test('should handle recursive function definitions', () => {
      repl.testProcessInput('factorial = fn n => if n <= 1 then 1 else n * factorial (n - 1)');
      
      logOutput = [];
      repl.testProcessInput('factorial 5');
      
      expect(logOutput.some(line => line.includes('120'))).toBe(true);
    });

    test('should handle list operations', () => {
      repl.testProcessInput('numbers = [1, 2, 3, 4, 5]');
      
      logOutput = [];
      repl.testProcessInput('head numbers');
      
      expect(logOutput.some(line => line.includes('1'))).toBe(true);
    });

    test('should handle record creation and access', () => {
      repl.testProcessInput('person = { name: "Alice", age: 30 }');
      
      logOutput = [];
      repl.testProcessInput('(@name person)');
      
      expect(logOutput.some(line => line.includes('Alice'))).toBe(true);
    });

    test('should handle pattern matching', () => {
      repl.testProcessInput('matchList = fn xs => match xs with | [] => "empty" | [h] => "single" | _ => "multiple"');
      
      logOutput = [];
      repl.testProcessInput('matchList []');
      expect(logOutput.some(line => line.includes('empty'))).toBe(true);
      
      logOutput = [];
      repl.testProcessInput('matchList [1]');
      expect(logOutput.some(line => line.includes('single'))).toBe(true);
      
      logOutput = [];
      repl.testProcessInput('matchList [1, 2, 3]');
      expect(logOutput.some(line => line.includes('multiple'))).toBe(true);
    });
  });

  describe('Type System Integration', () => {
    test('should show correct types for expressions', () => {
      repl.testProcessInput('42');
      expect(logOutput.some(line => line.includes('Int'))).toBe(true);
      
      logOutput = [];
      repl.testProcessInput('"hello"');
      expect(logOutput.some(line => line.includes('String'))).toBe(true);
      
      logOutput = [];
      repl.testProcessInput('fn x => x + 1');
      expect(logOutput.some(line => line.includes('Int -> Int'))).toBe(true);
    });

    test('should handle type inference for complex expressions', () => {
      repl.testProcessInput('map = fn f xs => match xs with | [] => [] | [h, ...t] => [f h, ...(map f t)]');
      
      logOutput = [];
      repl.testProcessInput('map (fn x => x * 2) [1, 2, 3]');
      
      expect(logOutput.some(line => line.includes('[2, 4, 6]'))).toBe(true);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle empty input gracefully', () => {
      const initialLogLength = logOutput.length;
      repl.testProcessInput('');
      
      // Should not produce additional output for empty input
      expect(logOutput.length).toBe(initialLogLength);
    });

    test('should handle whitespace-only input', () => {
      const initialLogLength = logOutput.length;
      repl.testProcessInput('   \t  \n  ');
      
      // Should not produce additional output for whitespace-only input
      expect(logOutput.length).toBe(initialLogLength);
    });

    test('should handle very long expressions', () => {
      const longExpression = '1 + '.repeat(100) + '1';
      repl.testProcessInput(longExpression);
      
      expect(logOutput.some(line => line.includes('101'))).toBe(true);
    });

    test('should handle deeply nested expressions', () => {
      repl.testProcessInput('((((1 + 2) * 3) + 4) * 5)');
      
      expect(logOutput.some(line => line.includes('65'))).toBe(true); // ((1+2)*3+4)*5 = (9+4)*5 = 65
    });
  });

  describe('Debugging Commands Integration', () => {
    test('should provide comprehensive debugging information', () => {
      // Test tokens command with complex expression
      repl.testHandleCommand('.tokens (fn x => x + 1)');
      
      expect(logOutput.some(line => line.includes('FN'))).toBe(true);
      expect(logOutput.some(line => line.includes('IDENTIFIER'))).toBe(true);
      expect(logOutput.some(line => line.includes('ARROW'))).toBe(true);
      
      // Test AST command
      logOutput = [];
      repl.testHandleCommand('.ast (fn x => x + 1)');
      
      expect(logOutput.some(line => line.includes('Function'))).toBe(true);
      expect(logOutput.some(line => line.includes('params'))).toBe(true);
      expect(logOutput.some(line => line.includes('body'))).toBe(true);
    });

    test('should handle file-based debugging commands gracefully when files dont exist', () => {
      repl.testHandleCommand('.tokens-file nonexistent.noo');
      
      expect(errorOutput.some(line => line.includes('Error reading file'))).toBe(true);
    });
  });
});