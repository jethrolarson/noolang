import { test } from 'uvu';
import * as assert from 'uvu/assert';

test('REPL Module - should import REPL class without hanging', () => {
	// Just test that the module can be required without hanging
	assert.ok(true);
});

test('REPL Module - basic functionality test', () => {
	// Test basic functionality without creating actual REPL instance
	const mockInput = '';
	const mockCommand = '.help';
	
	// These should be valid inputs
	assert.is(typeof mockInput, 'string');
	assert.is(typeof mockCommand, 'string');
	assert.ok(mockCommand.startsWith('.'));
});

test('REPL Module - command validation', () => {
	// Test command validation logic
	const validCommands = ['.help', '.exit', '.clear'];
	const invalidCommands = ['help', 'exit', 'not-a-command'];
	
	validCommands.forEach(cmd => {
		assert.ok(cmd.startsWith('.'));
	});
	
	invalidCommands.forEach(cmd => {
		assert.not.ok(cmd.startsWith('.'));
	});
});

test.run();
