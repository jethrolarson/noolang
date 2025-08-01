import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Import the testable REPL components
import { REPLCore, REPLOutput } from '../../repl';

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
	
	assert.ok(repl, 'should create REPL instance');
	assert.ok(repl.evaluator, 'should have evaluator');
	assert.ok(repl.typeState, 'should have type state');
});

test('REPL Core - should handle empty input', () => {
	const { repl, mockOutput } = createTestREPL();
	
	const result = repl.processInput('');
	
	assert.is(result.success, true, 'should succeed with empty input');
	assert.is(mockOutput.logs.length, 0, 'should not produce output');
	assert.is(mockOutput.errors.length, 0, 'should not produce errors');
});

test('REPL Core - should evaluate simple expressions', () => {
	const { repl, mockOutput } = createTestREPL();
	
	const result = repl.processInput('42');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce output');
	
	// Check that the result contains the expected value
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('42'), 'should contain the result value');
});

test('REPL Core - should evaluate string expressions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('"hello world"');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce output');
	
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('hello world'), 'should contain the result value');
});

test('REPL Core - should handle arithmetic expressions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('2 + 3');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce output');
	
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('5'), 'should contain the result value');
});

test('REPL Core - should handle variable definitions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('x = 42');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce output');
	
	// Now test that the variable can be used
	mockOutput.clear();
	const result2 = repl.processInput('x');
	
	assert.is(result2.success, true, 'should succeed');
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('42'), 'should contain the variable value');
});

test('REPL Core - should handle function definitions', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('myAdd = fn x y => x + y');
	
	assert.is(result.success, true, 'should succeed');
	
	// Test using the function
	mockOutput.clear();
	const result2 = repl.processInput('myAdd 2 3');
	
	assert.is(result2.success, true, 'should succeed');
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('5'), 'should contain the function result');
});

test('REPL Core - should handle help command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.help');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce help output');
	
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('Commands'), 'should contain help information');
	assert.ok(output.includes('.quit'), 'should list quit command');
	assert.ok(output.includes('.env'), 'should list env command');
});

test('REPL Core - should handle env command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define a variable first
	repl.processInput('testVar = 123');
	mockOutput.clear();
	
	const result = repl.processInput('.env');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce environment output');
	
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('testVar'), 'should show defined variable');
	assert.ok(output.includes('123'), 'should show variable value');
});

test('REPL Core - should handle clear-env command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	// Define a variable
	repl.processInput('testVar = 123');
	
	// Clear environment
	mockOutput.clear();
	const result = repl.processInput('.clear-env');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce clear confirmation');
	
	// Try to use the variable - should fail now
	mockOutput.clear();
	const result2 = repl.processInput('testVar');
	
	assert.is(result2.success, false, 'should fail after clearing environment');
	assert.ok(mockOutput.errors.length > 0, 'should produce error for undefined variable');
});

test('REPL Core - should handle quit command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.quit');
	
	assert.is(result.success, true, 'should succeed');
	// Note: The actual REPL wrapper handles process exit, not the core
});

test('REPL Core - should handle unknown commands', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.unknown');
	
	assert.is(result.success, false, 'should fail for unknown command');
	assert.ok(mockOutput.errors.length > 0, 'should produce error message');
	
	const errorOutput = mockOutput.errors.join(' ');
	assert.ok(errorOutput.includes('Unknown command'), 'should explain unknown command');
});

test('REPL Core - should handle syntax errors gracefully', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('invalid syntax @#$');
	
	assert.is(result.success, false, 'should fail for invalid syntax');
	assert.ok(result.error, 'should provide error message');
	assert.ok(mockOutput.errors.length > 0, 'should output error');
});

test('REPL Core - should handle tokens command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.tokens (42 + 3)');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce token output');
	
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('Tokens'), 'should show tokens header');
	assert.ok(output.includes('NUMBER'), 'should show token types');
});

test('REPL Core - should handle ast command', () => {
	const mockOutput = new MockOutput();
	const repl = new REPLCore(mockOutput, { skipStdlib: true });
	
	const result = repl.processInput('.ast (42)');
	
	assert.is(result.success, true, 'should succeed');
	assert.ok(mockOutput.logs.length > 0, 'should produce AST output');
	
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('AST'), 'should show AST header');
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
	
	assert.is(result.success, true, 'should succeed');
	const output = mockOutput.logs.join(' ');
	assert.ok(output.includes('30'), 'should calculate correctly using previous definitions');
});

test.run();
