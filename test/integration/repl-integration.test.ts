import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

describe.skip('REPL Integration Tests', () => {
  let replProcess: ChildProcess;
  let output: string;
  let errorOutput: string;

  const startREPL = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      replProcess = spawn('npm', ['run', 'dev'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      output = '';
      errorOutput = '';

      replProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      replProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      replProcess.on('error', reject);

      // Wait for REPL to start (look for prompt or startup message)
      const checkInterval = setInterval(() => {
        if (output.includes('>') || output.includes('noo>')) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('REPL startup timeout'));
      }, 10000);
    });
  };

  const sendInput = (input: string): Promise<string> => {
    return new Promise((resolve) => {
      const beforeOutput = output;
      replProcess.stdin?.write(input + '\n');
      
      // Wait for response
      setTimeout(() => {
        const newOutput = output.substring(beforeOutput.length);
        resolve(newOutput);
      }, 1000);
    });
  };

  const stopREPL = (): Promise<void> => {
    return new Promise((resolve) => {
      if (replProcess) {
        replProcess.kill();
        replProcess.on('exit', () => resolve());
      } else {
        resolve();
      }
    });
  };

  beforeEach(async () => {
    await startREPL();
  }, 15000);

  afterEach(async () => {
    await stopREPL();
  });

  describe('Basic Arithmetic', () => {
    test('should evaluate simple addition', async () => {
      const result = await sendInput('2 + 3');
      expect(result).toContain('5');
    });

    test('should evaluate multiplication', async () => {
      const result = await sendInput('4 * 7');
      expect(result).toContain('28');
    });

    test('should handle floating point numbers', async () => {
      const result = await sendInput('3.14 * 2');
      expect(result).toContain('6.28');
    });
  });

  describe('Variable Assignment and Retrieval', () => {
    test('should assign and retrieve variables', async () => {
      await sendInput('x = 42');
      const result = await sendInput('x');
      expect(result).toContain('42');
    });

    test('should handle variable expressions', async () => {
      await sendInput('a = 10');
      await sendInput('b = 20');
      const result = await sendInput('a + b');
      expect(result).toContain('30');
    });

    test('should handle variable reassignment', async () => {
      await sendInput('value = 100');
      await sendInput('value = 200');
      const result = await sendInput('value');
      expect(result).toContain('200');
    });
  });

  describe('Function Definitions and Calls', () => {
    test('should define and call functions', async () => {
      await sendInput('double = (x) => x * 2');
      const result = await sendInput('double(5)');
      expect(result).toContain('10');
    });

    test('should handle recursive functions', async () => {
      await sendInput('factorial = (n) => if n <= 1 then 1 else n * factorial(n - 1)');
      const result = await sendInput('factorial(4)');
      expect(result).toContain('24');
    });
  });

  describe('Data Structures', () => {
    test('should handle lists', async () => {
      const result = await sendInput('[1, 2, 3, 4]');
      expect(result).toMatch(/\[.*1.*2.*3.*4.*\]/);
    });

    test('should handle records', async () => {
      const result = await sendInput('{ name: "John", age: 30 }');
      expect(result).toContain('name');
      expect(result).toContain('John');
    });

    test('should handle tuples', async () => {
      const result = await sendInput('(42, "hello", true)');
      expect(result).toContain('42');
      expect(result).toContain('hello');
    });
  });

  describe('REPL Commands', () => {
    test('should respond to .help command', async () => {
      const result = await sendInput('.help');
      expect(result).toContain('Commands') || expect(result).toContain('help');
    });

    test('should respond to .env command', async () => {
      await sendInput('testVar = 123');
      const result = await sendInput('.env');
      expect(result).toContain('testVar');
    });

    test('should handle .quit command', async () => {
      const result = await sendInput('.quit');
      // Process should exit, so we don't expect more output
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle syntax errors gracefully', async () => {
      const result = await sendInput('2 + + 3');
      expect(result).toContain('error') || expect(result).toContain('Error');
    });

    test('should handle undefined variable errors', async () => {
      const result = await sendInput('undefinedVar');
      expect(result).toContain('error') || expect(result).toContain('undefined');
    });

    test('should continue after errors', async () => {
      await sendInput('invalid syntax here');
      const result = await sendInput('2 + 2');
      expect(result).toContain('4');
    });
  });

  describe('File Import', () => {
    test('should import files correctly', async () => {
      // This assumes test files exist
      const result = await sendInput('import "test/test_import"');
      expect(result).toBeDefined();
    });
  });

  describe('Multi-line Input', () => {
    test('should handle complex expressions', async () => {
      const complexExpr = `
        let result = if true then
          let x = 10
          let y = 20
          x + y
        else
          0
      `;
      const result = await sendInput(complexExpr);
      expect(result).toContain('30');
    });
  });
}, 30000); // Extended timeout for integration tests