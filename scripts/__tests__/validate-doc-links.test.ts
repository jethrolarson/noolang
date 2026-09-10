import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBrokenLinks } from '../validate-doc-links';

describe('documentation link validation', () => {
	test('resolves links relative to the document and accepts repository-root links', () => {
		const root = mkdtempSync(join(tmpdir(), 'noolang-doc-links-'));
		mkdirSync(join(root, 'docs', 'guide'), { recursive: true });
		writeFileSync(join(root, 'README.md'), '# Project\n');
		writeFileSync(join(root, 'docs', 'target.md'), '# Target\n');
		writeFileSync(
			join(root, 'docs', 'guide', 'index.md'),
			'[parent](../target.md) [root](/README.md) [section](../target.md#target)\n'
		);

		expect(findBrokenLinks(root, ['docs/guide/index.md'])).toEqual([]);
	});

	test('reports missing inline, reference, and directory links with source lines', () => {
		const root = mkdtempSync(join(tmpdir(), 'noolang-doc-links-'));
		mkdirSync(join(root, 'docs'), { recursive: true });
		writeFileSync(
			join(root, 'docs', 'guide.md'),
			'[inline](missing.md)\n[reference][missing]\n[missing]: ../absent/\n'
		);

		expect(findBrokenLinks(root, ['docs/guide.md'])).toEqual([
			{ file: 'docs/guide.md', line: 1, target: 'missing.md' },
			{ file: 'docs/guide.md', line: 3, target: '../absent/' },
		]);
	});

	test('rejects links that escape the repository even when their target exists', () => {
		const parent = mkdtempSync(join(tmpdir(), 'noolang-doc-links-parent-'));
		const root = join(parent, 'repo');
		mkdirSync(join(root, 'docs'), { recursive: true });
		writeFileSync(join(parent, 'outside.md'), '# Outside\n');
		writeFileSync(
			join(root, 'docs', 'guide.md'),
			'[outside](../../outside.md)\n'
		);

		expect(findBrokenLinks(root, ['docs/guide.md'])).toEqual([
			{ file: 'docs/guide.md', line: 1, target: '../../outside.md' },
		]);
	});

	test('ignores external URLs, email links, and in-page anchors', () => {
		const root = mkdtempSync(join(tmpdir(), 'noolang-doc-links-'));
		mkdirSync(join(root, 'docs'), { recursive: true });
		writeFileSync(
			join(root, 'docs', 'guide.md'),
			'[web](https://example.com) [mail](mailto:test@example.com) [local](#section)\n'
		);

		expect(findBrokenLinks(root, ['docs/guide.md'])).toEqual([]);
	});
});
