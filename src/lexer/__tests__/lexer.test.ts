import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../lexer/lexer';

// Helper function to create lexer and get all tokens
const tokenize = (input: string) => new Lexer(input).tokenize();

// Helper function to get token values without location info
const getTokenValues = (input: string) =>
	tokenize(input).map(token => ({ type: token.type, value: token.value }));

test('Lexer - Numbers - should tokenize integers', () => {
	const tokens = getTokenValues('123');
	assert.equal(tokens, [
		{ type: 'NUMBER', value: '123' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Numbers - should tokenize floating point numbers', () => {
	const tokens = getTokenValues('123.456');
	assert.equal(tokens, [
		{ type: 'NUMBER', value: '123.456' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Numbers - should tokenize number followed by non-digit', () => {
	const tokens = getTokenValues('123abc');
	assert.equal(tokens, [
		{ type: 'NUMBER', value: '123' },
		{ type: 'IDENTIFIER', value: 'abc' },
		{ type: 'EOF', value: '' },
	]);
});

test('Lexer - Numbers - should not tokenize dot without following digit as float', () => {
	const tokens = getTokenValues('123.');
	assert.equal(tokens, [
		{ type: 'NUMBER', value: '123' },
		{ type: 'PUNCTUATION', value: '.' },
		{ type: 'EOF', value: '' },
	]);
});
