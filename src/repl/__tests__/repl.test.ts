// Import the testable REPL components
import { REPLCore, REPLOutput } from '../../repl';
import { describe, test, expect } from 'bun:test';

// Mock output for testing
class MockOutput implements REPLOutput {
	public logs: string[] = [];
	public errors: string[] = [];

	log(message: string): void {
		this.logs.push(message);
	}

	error(message: string): void {
		this.errors.push(message);
	}

	clear(): void {
		this.logs = [];
		this.errors = [];
	}
}

// Helper function to create test REPL without stdlib dependency
function createTestREPL(): { repl: REPLCore; mockOutput: MockOutput } {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	return { repl, mockOutput };
}

test('REPL Core - should create instance successfully', () => {
	const { repl, mockOutput } = createTestREPL();
	
	expect(repl).toBeTruthy();
	expect(repl.evaluator).toBeTruthy();
	expect(repl.typeState).toBeTruthy();
});

test('REPL Core - should handle empty input', () => {
	const { repl, mockOutput } = createTestREPL();
	
	const result = repl.processInput('');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length).toBe(0);
	expect(mockOutput.errors.length).toBe(0);
});

test('REPL Core - should evaluate simple expressions', () => {
	const { repl, mockOutput } = createTestREPL();
	
	const result = repl.processInput('42');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	// Check that the result contains the expected value
	const output = mockOutput.logs.join(' ');
	expect(output.includes('42')).toBeTruthy();
});

test('REPL Core - should evaluate string expressions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('"hello world"');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(output.includes('hello world')).toBeTruthy();
});

test('REPL Core - should handle arithmetic expressions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('2 + 3');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(output.includes('5')).toBeTruthy();
});

test('REPL Core - should handle variable definitions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('x = 42');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	// Now test that the variable can be used
	mockOutput.clear();
	const result2 = repl.processInput('x');
	
	expect(result2.success).toBe(true);
	const output = mockOutput.logs.join(' ');
	expect(output.includes('42')).toBeTruthy();
});

test('REPL Core - should handle function definitions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('myAdd = fn x y => x + y');
	
	expect(result.success).toBe(true);
	
	// Test using the function
	mockOutput.clear();
	const result2 = repl.processInput('myAdd 2 3');
	
	expect(result2.success).toBe(true);
	const output = mockOutput.logs.join(' ');
	expect(output.includes('5')).toBeTruthy();
});

test('REPL Core - should handle help command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.help');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(output.includes('Commands')).toBeTruthy();
	expect(output.includes('.quit')).toBeTruthy();
	expect(output.includes('.env')).toBeTruthy();
});

test('REPL Core - should handle env command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define a variable first
	repl.processInput('testVar = 123');
	mockOutput.clear();
	
	const result = repl.processInput('.env');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(output.includes('testVar')).toBeTruthy();
	expect(output.includes('123')).toBeTruthy();
});

test('REPL Core - should handle clear-env command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define a variable
	repl.processInput('testVar = 123');
	
	// Clear environment
	mockOutput.clear();
	const result = repl.processInput('.clear-env');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	// Try to use the variable - should fail now
	mockOutput.clear();
	const result2 = repl.processInput('testVar');
	
	expect(result2.success).toBe(false);
	expect(mockOutput.errors.length > 0).toBeTruthy();
});

test('REPL Core - should handle quit command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.quit');
	
	expect(result.success).toBe(true);
	// Note: The actual REPL wrapper handles process exit, not the core
});

test('REPL Core - should handle unknown commands', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.unknown');
	
	expect(result.success).toBe(false);
	expect(mockOutput.errors.length > 0).toBeTruthy();
	
	const errorOutput = mockOutput.errors.join(' ');
	expect(errorOutput.includes('Unknown command')).toBeTruthy();
});

test('REPL Core - should handle syntax errors gracefully', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('invalid syntax @#$');
	
	expect(result.success).toBe(false);
	expect(result.error).toBeTruthy();
	expect(mockOutput.errors.length > 0).toBeTruthy();
});

test('REPL Core - should handle tokens command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.tokens (42 + 3)');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(output.includes('Tokens')).toBeTruthy();
	expect(output.includes('NUMBER')).toBeTruthy();
});

test('REPL Core - should handle ast command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.ast (42)');
	
	expect(result.success).toBe(true);
	expect(mockOutput.logs.length > 0).toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(output.includes('AST')).toBeTruthy();
});

test('REPL Core - should maintain state between inputs', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define multiple variables
	repl.processInput('a = 10');
	repl.processInput('b = 20');
	repl.processInput('c = a + b');
	
	mockOutput.clear();
	const result = repl.processInput('c');
	
	expect(result.success).toBe(true);
	const output = mockOutput.logs.join(' ');
	expect(output.includes('30')).toBeTruthy();
});

