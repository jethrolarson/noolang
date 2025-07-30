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
	
	expect(expect(repl, 'should create REPL instance').toBeTruthy();
	expect(expect(repl.evaluator, 'should have evaluator').toBeTruthy();
	expect(expect(repl.typeState, 'should have type state').toBeTruthy();
});

test('REPL Core - should handle empty input', () => {
	const { repl, mockOutput } = createTestREPL();
	
	const result = repl.processInput('');
	
	expect(result.success).toBe(true, 'should succeed with empty input');
	expect(mockOutput.logs.length).toBe(0, 'should not produce output');
	expect(mockOutput.errors.length).toBe(0, 'should not produce errors');
});

test('REPL Core - should evaluate simple expressions', () => {
	const { repl, mockOutput } = createTestREPL();
	
	const result = repl.processInput('42');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce output').toBeTruthy();
	
	// Check that the result contains the expected value
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('42').toBeTruthy(), 'should contain the result value');
});

test('REPL Core - should evaluate string expressions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('"hello world"');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce output').toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('hello world').toBeTruthy(), 'should contain the result value');
});

test('REPL Core - should handle arithmetic expressions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('2 + 3');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce output').toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('5').toBeTruthy(), 'should contain the result value');
});

test('REPL Core - should handle variable definitions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('x = 42');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce output').toBeTruthy();
	
	// Now test that the variable can be used
	mockOutput.clear();
	const result2 = repl.processInput('x');
	
	expect(result2.success).toBe(true, 'should succeed');
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('42').toBeTruthy(), 'should contain the variable value');
});

test('REPL Core - should handle function definitions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('myAdd = fn x y => x + y');
	
	expect(result.success).toBe(true, 'should succeed');
	
	// Test using the function
	mockOutput.clear();
	const result2 = repl.processInput('myAdd 2 3');
	
	expect(result2.success).toBe(true, 'should succeed');
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('5').toBeTruthy(), 'should contain the function result');
});

test('REPL Core - should handle help command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.help');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce help output').toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('Commands').toBeTruthy(), 'should contain help information');
	expect(expect(output.includes('.quit').toBeTruthy(), 'should list quit command');
	expect(expect(output.includes('.env').toBeTruthy(), 'should list env command');
});

test('REPL Core - should handle env command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define a variable first
	repl.processInput('testVar = 123');
	mockOutput.clear();
	
	const result = repl.processInput('.env');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce environment output').toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('testVar').toBeTruthy(), 'should show defined variable');
	expect(expect(output.includes('123').toBeTruthy(), 'should show variable value');
});

test('REPL Core - should handle clear-env command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define a variable
	repl.processInput('testVar = 123');
	
	// Clear environment
	mockOutput.clear();
	const result = repl.processInput('.clear-env');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce clear confirmation').toBeTruthy();
	
	// Try to use the variable - should fail now
	mockOutput.clear();
	const result2 = repl.processInput('testVar');
	
	expect(result2.success).toBe(false, 'should fail after clearing environment');
	expect(expect(mockOutput.errors.length > 0, 'should produce error for undefined variable').toBeTruthy();
});

test('REPL Core - should handle quit command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.quit');
	
	expect(result.success).toBe(true, 'should succeed');
	// Note: The actual REPL wrapper handles process exit, not the core
});

test('REPL Core - should handle unknown commands', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.unknown');
	
	expect(result.success).toBe(false, 'should fail for unknown command');
	expect(expect(mockOutput.errors.length > 0, 'should produce error message').toBeTruthy();
	
	const errorOutput = mockOutput.errors.join(' ');
	expect(expect(errorOutput.includes('Unknown command').toBeTruthy(), 'should explain unknown command');
});

test('REPL Core - should handle syntax errors gracefully', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('invalid syntax @#$');
	
	expect(result.success).toBe(false, 'should fail for invalid syntax');
	expect(expect(result.error, 'should provide error message').toBeTruthy();
	expect(expect(mockOutput.errors.length > 0, 'should output error').toBeTruthy();
});

test('REPL Core - should handle tokens command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.tokens (42 + 3)');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce token output').toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('Tokens').toBeTruthy(), 'should show tokens header');
	expect(expect(output.includes('NUMBER').toBeTruthy(), 'should show token types');
});

test('REPL Core - should handle ast command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.ast (42)');
	
	expect(result.success).toBe(true, 'should succeed');
	expect(expect(mockOutput.logs.length > 0, 'should produce AST output').toBeTruthy();
	
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('AST').toBeTruthy(), 'should show AST header');
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
	
	expect(result.success).toBe(true, 'should succeed');
	const output = mockOutput.logs.join(' ');
	expect(expect(output.includes('30').toBeTruthy(), 'should calculate correctly using previous definitions');
});

