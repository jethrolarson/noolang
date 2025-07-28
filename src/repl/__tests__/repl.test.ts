import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Mock console before importing REPL to prevent output pollution
const originalConsole = { ...console };
const mockConsole = {
	...originalConsole,
	log: () => {},
	warn: () => {},
	error: () => {},
};
global.console = mockConsole;

// Mock node:readline module to prevent hanging in tests
const mockReadlineInterface = {
	prompt: () => {},
	on: () => {},
	close: () => {},
};

const mockReadline = {
	createInterface: () => mockReadlineInterface,
};

// Override module cache to mock readline
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(...args: any[]) {
	if (args[0] === 'node:readline') {
		return mockReadline;
	}
	return originalRequire.apply(this, args);
};

import { REPL } from '../../repl';

test('REPL Instance - should create REPL instance', () => {
	const repl = new REPL();
	assert.instance(repl, REPL);
});

test('REPL Instance - should have evaluator property', () => {
	const repl = new REPL();
	assert.ok(repl.evaluator, 'evaluator should be defined');
});

test('REPL Instance - should have typeState property', () => {
	const repl = new REPL();
	assert.ok(repl.typeState, 'typeState should be defined');
});

test('REPL Instance - should have readline interface', () => {
	const repl = new REPL();
	assert.ok(repl.rl, 'readline interface should be defined');
});

test('Basic Functionality - should handle empty input', () => {
	const repl = new REPL();
	const processInput = repl.processInput.bind(repl);
	assert.not.throws(() => processInput(''), 'empty input should not throw');
});

test('Basic Functionality - should handle command input', () => {
	const repl = new REPL();
	const processInput = repl.processInput.bind(repl);
	assert.not.throws(() => processInput('.help'), 'help command should not throw');
});

test('Basic Functionality - should handle unknown command', () => {
	const repl = new REPL();
	const processInput = repl.processInput.bind(repl);
	assert.not.throws(() => processInput('.unknown'), 'unknown command should not throw');
});

// Restore console after tests
test.after(() => {
	global.console = originalConsole;
});

test.run();
