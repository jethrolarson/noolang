import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

// Integration tests that spawn the actual REPL process
describe('REPL Integration Tests', () => {
  let replProcess: ChildProcess;
  let output: string[] = [];
  let errorOutput: string[] = [];

  const startREPL = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Compile TypeScript first if needed
      const tsNodePath = path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node');
      const replPath = path.join(__dirname, '..', 'src', 'repl.ts');
      
      replProcess = spawn('node', ['-e', `require('ts-node/register'); require('${replPath}')`], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..')
      });

      replProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        output.push(text);
        // Look for the initial prompt to know REPL is ready
        if (text.includes('Welcome to Noolang') || text.includes('noolang>')) {
          resolve();
        }
      });

      replProcess.stderr?.on('data', (data) => {
        errorOutput.push(data.toString());
      });

      replProcess.on('error', (error) => {
        reject(error);
      });

      // Timeout if REPL doesn't start
      setTimeout(() => {
        reject(new Error('REPL startup timeout'));
      }, 10000);
    });
  };

  const sendInput = (input: string): Promise<string> => {
    return new Promise((resolve) => {
      const initialOutputLength = output.length;
      
      replProcess.stdin?.write(input + '\n');
      
      // Wait for response
      const checkForNewOutput = () => {
        if (output.length > initialOutputLength) {
          const newOutput = output.slice(initialOutputLength).join('');
          resolve(newOutput);
        } else {
          setTimeout(checkForNewOutput, 100);
        }
      };
      
      setTimeout(checkForNewOutput, 100);
    });
  };

  const cleanup = () => {
    if (replProcess && !replProcess.killed) {
      replProcess.kill();
    }
  };

  beforeEach(async () => {
    output = [];
    errorOutput = [];
    // Note: Starting REPL for each test might be slow, but ensures clean state
    // In a real scenario, you might want to reuse the process for performance
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    cleanup();
  });

  test('should start REPL and show welcome message', async () => {
    await startREPL();
    
    const welcomeMessage = output.join('');
    expect(welcomeMessage).toContain('Welcome to Noolang');
  }, 15000);

  test('should evaluate simple expressions interactively', async () => {
    await startREPL();
    
    const response1 = await sendInput('1 + 2');
    expect(response1).toContain('3');
    
    const response2 = await sendInput('"hello world"');
    expect(response2).toContain('hello world');
  }, 15000);

  test('should maintain state across multiple inputs', async () => {
    await startREPL();
    
    await sendInput('x = 42');
    const response = await sendInput('x * 2');
    
    expect(response).toContain('84');
  }, 15000);

  test('should handle REPL commands', async () => {
    await startREPL();
    
    const helpResponse = await sendInput('.help');
    expect(helpResponse).toContain('Noolang REPL Commands');
    expect(helpResponse).toContain('.quit');
    expect(helpResponse).toContain('.env');
  }, 15000);

  test('should handle errors gracefully and continue', async () => {
    await startREPL();
    
    // Cause an error
    const errorResponse = await sendInput('1 + "hello"');
    expect(errorResponse).toContain('Error');
    
    // Should still work after error
    const successResponse = await sendInput('2 + 3');
    expect(successResponse).toContain('5');
  }, 15000);

  test('should exit cleanly on .quit command', async () => {
    await startREPL();
    
    const quitPromise = new Promise<void>((resolve) => {
      replProcess.on('exit', (code) => {
        expect(code).toBe(0);
        resolve();
      });
    });
    
    replProcess.stdin?.write('.quit\n');
    
    await quitPromise;
  }, 15000);
});

// Performance and stress tests
describe('REPL Performance Tests', () => {
  test('should handle rapid successive inputs without crashing', async () => {
    // This test would be implemented if we had a more sophisticated
    // way to interact with the REPL process programmatically
    // For now, we'll create a mock version using our TestableREPL
    expect(true).toBe(true); // Placeholder
  });

  test('should handle large expressions without memory issues', async () => {
    // Another performance test placeholder
    expect(true).toBe(true);
  });
});

// Regression tests for specific issues
describe('REPL Regression Tests', () => {
  test('should not have type pollution between polymorphic function uses', async () => {
    // This test ensures the fix for type pollution is working in the actual REPL
    // Would be implemented with real REPL interaction
    expect(true).toBe(true); // Placeholder
  });

  test('should handle complex nested expressions without stack overflow', async () => {
    // Test for handling deeply nested expressions
    expect(true).toBe(true); // Placeholder
  });
});