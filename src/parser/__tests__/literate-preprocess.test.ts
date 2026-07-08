import { Lexer } from '../../lexer/lexer';
import { parse, preprocessLiterateNoolang } from '../parser';
import { test, expect } from 'bun:test';

// Literate markdown concatenates all ```noolang blocks into a single program.
// A separator must be inserted between blocks so the last statement of one
// block does not merge into the first statement of the next.

const parseLiterate = (markdown: string) =>
	parse(new Lexer(preprocessLiterateNoolang(markdown)).tokenize());

test('preprocessLiterateNoolang - separates consecutive code blocks', () => {
	// The first block's final statement has no trailing `;` (a common case,
	// especially when an inline comment would eat one). Without a separator the
	// two blocks merge into `x = 1 y = 2` and fail to parse.
	const md = [
		'```noolang',
		'x = 1',
		'```',
		'',
		'Some prose.',
		'',
		'```noolang',
		'y = 2',
		'```',
	].join('\n');

	expect(() => parseLiterate(md)).not.toThrow();
});

test('preprocessLiterateNoolang - separator survives an inline comment on the last line', () => {
	const md = [
		'```noolang',
		'x = 1 # a trailing comment that would eat a semicolon',
		'```',
		'```noolang',
		'y = 2',
		'```',
	].join('\n');

	expect(() => parseLiterate(md)).not.toThrow();
});

test('preprocessLiterateNoolang - preserves line parity with the source', () => {
	const md = ['prose line 1', '```noolang', 'x = 1', '```'].join('\n');
	const output = preprocessLiterateNoolang(md);
	// `x = 1` is on source line 3, so it must remain on output line 3.
	expect(output.split('\n')[2]).toBe('x = 1');
});
