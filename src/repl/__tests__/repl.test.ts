import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Mock console before importing REPL to prevent output pollution
const originalConsole = { ...console };
global.console = {
	...originalConsole,
	log: () => {},
	warn: () => {},
	error: () => {},
};

// Simple mock for readline to prevent hanging
const mockReadline = {
	createInterface: () => ({
		prompt: () => {},
		on: () => {},
		close: () => {},
	}),
};

// Replace the require cache for readline
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
	if (id === 'node:readline' || id === 'readline') {
		return mockReadline;
	}
	return originalRequire.apply(this, arguments);
};

import { REPL } from '../../repl';

test('REPL Unit Tests - REPL Instance - should create REPL instance', () => {
	const repl = new REPL();
	assert.ok(repl instanceof REPL);
});

test('REPL Unit Tests - REPL Instance - should have evaluator property', () => {
	const repl = new REPL();
	assert.ok(repl.evaluator);
});

test('REPL Unit Tests - REPL Instance - should have typeState property', () => {
	const repl = new REPL();
	assert.ok(repl.typeState);
});

test('REPL Unit Tests - REPL Instance - should have readline interface', () => {
	const repl = new REPL();
	assert.ok(repl.rl);
});

test('REPL Unit Tests - Basic Functionality - should handle empty input', () => {
	const repl = new REPL();
	const processInput = repl.processInput.bind(repl);
	assert.not.throws(() => processInput(''));
});

test('REPL Unit Tests - Basic Functionality - should handle command input', () => {
	const repl = new REPL();
	const processInput = repl.processInput.bind(repl);
	assert.not.throws(() => processInput('.help'));
});

test('REPL Unit Tests - Basic Functionality - should handle unknown command', () => {
	const repl = new REPL();
	const processInput = repl.processInput.bind(repl);
	assert.not.throws(() => processInput('.unknown'));
});

// Restore original console after all tests
process.on('exit', () => {
	global.console = originalConsole;
});

test.run();
