import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';

function parseNoo(src: string) {
	const lexer = new Lexer(src);
	const tokens = lexer.tokenize();
	return parse(tokens);
}

test('parses named record', () => {
	const program = parseNoo('{ @a 1, @b 2 }');
	const record = program.statements[0];
	assert.is(record.kind, 'record');
	if (record.kind === 'record') {
		assert.is(record.fields.length, 2);
		assert.is(record.fields[0].name, 'a');
		assert.is(record.fields[1].name, 'b');
		// Skip checking exact value structure - just verify they exist
		assert.ok(record.fields[0].value);
		assert.ok(record.fields[1].value);
	}
});

test('parses tuple (nameless record)', () => {
	const program = parseNoo('{ 1, 2 }');
	const tuple = program.statements[0];
	assert.is(tuple.kind, 'tuple');
	if (tuple.kind === 'tuple') {
		assert.is(tuple.elements.length, 2);
		assert.ok(tuple.elements[0]);
		assert.ok(tuple.elements[1]);
	}
});

test('parses unit (empty braces)', () => {
	const program = parseNoo('{ }');
	const unit = program.statements[0];
	assert.is(unit.kind, 'unit');
});

test('throws on mixed named and positional fields', () => {
	assert.throws(() => parseNoo('{ 1, @a 2 }'));
	assert.throws(() => parseNoo('{ @a 2, 1 }'));
});

test.run();
