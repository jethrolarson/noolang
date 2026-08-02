import { parseLiterateFrontmatter } from '../parser';
import { test, expect } from 'bun:test';

test('parseLiterateFrontmatter - no frontmatter returns defaults and unchanged body', () => {
	const md = ['# Title', '', '```noolang', 'x = 1', '```'].join('\n');
	const { flags, body } = parseLiterateFrontmatter(md);
	expect(flags).toEqual({ shadow: false, assert: false });
	expect(body).toBe(md);
});

test('parseLiterateFrontmatter - shadow: true only', () => {
	const md = ['---', 'shadow: true', '---', '# Title', 'rest of doc'].join('\n');
	const { flags, body } = parseLiterateFrontmatter(md);
	expect(flags.shadow).toBe(true);
	expect(flags.assert).toBe(false);
	const bodyLines = body.split('\n');
	expect(bodyLines.length).toBe(md.split('\n').length);
	expect(bodyLines[3]).toBe('# Title');
	expect(bodyLines[4]).toBe('rest of doc');
});

test('parseLiterateFrontmatter - both flags present', () => {
	const md = ['---', 'shadow: true', 'assert: true', '---', 'body'].join('\n');
	const { flags } = parseLiterateFrontmatter(md);
	expect(flags).toEqual({ shadow: true, assert: true });
});

test('parseLiterateFrontmatter - unterminated frontmatter falls back to no-frontmatter', () => {
	const md = ['---', 'shadow: true', 'no closing delimiter here'].join('\n');
	const { flags, body } = parseLiterateFrontmatter(md);
	expect(flags).toEqual({ shadow: false, assert: false });
	expect(body).toBe(md);
});

test('parseLiterateFrontmatter - ignores malformed lines inside the block', () => {
	const md = ['---', '', 'not a key value line', 'assert: true', '---', 'body'].join(
		'\n'
	);
	const { flags } = parseLiterateFrontmatter(md);
	expect(flags).toEqual({ shadow: false, assert: true });
});

test('parseLiterateFrontmatter - tolerates whitespace variation around the colon', () => {
	for (const line of ['shadow: true', 'shadow : true', ' shadow : true ', 'shadow :true', 'shadow:true']) {
		const md = ['---', line, '---', 'body'].join('\n');
		const { flags } = parseLiterateFrontmatter(md);
		expect(flags.shadow).toBe(true);
	}
});
