const { test } = require('uvu');
const assert = require('uvu/assert');

// Mock readline completely before any imports
const readlinePath = require.resolve('node:readline');
require.cache[readlinePath] = {
	exports: {
		createInterface: () => ({
			prompt: () => {},
			on: () => {},
			close: () => {},
			question: (q, cb) => cb(''),
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

// Mock console to prevent output
global.console = {
	...console,
	log: () => {},
	warn: () => {},
	error: () => {},
};

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
	assert.ok(typeof repl.processInput === 'function');
});

test.run();
