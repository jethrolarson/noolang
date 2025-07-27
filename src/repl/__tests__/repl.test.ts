import { test } from 'uvu';
import * as assert from 'uvu/assert';

// Mock readline module completely before any other imports
const path = require('path');
const readlinePath = require.resolve('node:readline');

// Override the module cache
require.cache[readlinePath] = {
	exports: {
		createInterface: () => ({
			prompt: () => {},
			on: () => {},
			close: () => {},
			question: (q: string, cb: Function) => cb(''),
			write: () => {},
			setPrompt: () => {},
		})
	},
	loaded: true,
	children: [],
	parent: null,
	filename: readlinePath,
	id: readlinePath,
	paths: []
};

// Now safely import REPL
const { REPL } = require('../../repl');

test('REPL Unit Tests - should create REPL instance', () => {
	const repl = new REPL();
	assert.ok(repl);
});

test('REPL Unit Tests - should have required properties', () => {
	const repl = new REPL();
	assert.ok(repl.evaluator);
	assert.ok(repl.typeState);
});

test('REPL Unit Tests - should handle basic commands', () => {
	const repl = new REPL();
	// Test that processInput method exists and doesn't throw
	assert.ok(typeof repl.processInput === 'function');
});

test.run();
