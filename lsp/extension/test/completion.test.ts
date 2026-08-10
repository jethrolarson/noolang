/**
 * Completion tests for Noolang LSP server.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { LSPServerHarness } from './harness/LSPServerHarness';

describe('LSP Completion', () => {
	let harness: LSPServerHarness;

	beforeAll(async () => {
		harness = await LSPServerHarness.create();
	});

	afterAll(async () => {
		await harness.close();
	});

	test('returns completion items for keywords', async () => {
		const uri = 'file:///test.noo';
		const content = 'f';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 1);

		expect(completions).toBeDefined();
		expect(Array.isArray(completions)).toBe(true);
		expect(completions.length).toBeGreaterThan(0);

		// Check that we have keywords
		const keywordItems = completions.filter((item: any) =>
			item.kind === 14 && ['fn', 'if', 'then', 'else', 'match', 'with', 'variant', 'mut', 'constraint', 'implement'].includes(item.label)
		);
		expect(keywordItems.length).toBeGreaterThan(0);
	});

	test('returns completion items for builtins', async () => {
		const uri = 'file:///test.noo';
		const content = '';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 0);

		expect(completions).toBeDefined();
		expect(Array.isArray(completions)).toBe(true);

		// Check that we have builtin functions (kind 3 = Function)
		const builtinItems = completions.filter((item: any) =>
			item.kind === 3 && ['head', 'tail', 'map', 'filter', 'reduce', 'length', 'print', 'toString', 'read', 'write', 'log', 'random'].includes(item.label)
		);
		expect(builtinItems.length).toBeGreaterThan(0);
	});

	test('returns completion items for constructors', async () => {
		const uri = 'file:///test.noo';
		const content = '';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 0);

		expect(completions).toBeDefined();
		expect(Array.isArray(completions)).toBe(true);

		// Check that we have constructors (kind 4 = Constructor)
		const ctorItems = completions.filter((item: any) =>
			item.kind === 4 && ['True', 'False', 'Some', 'None', 'Ok', 'Err'].includes(item.label)
		);
		expect(ctorItems.length).toBeGreaterThan(0);
	});

	test('completion items have proper structure', async () => {
		const uri = 'file:///test.noo';
		const content = 'f';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 1);
		expect(completions.length).toBeGreaterThan(0);

		const item = completions[0];
		expect(item).toHaveProperty('label');
		expect(item).toHaveProperty('kind');
		expect(item).toHaveProperty('detail');
		expect(item).toHaveProperty('insertText');
	});

	test('completion includes all expected keywords', async () => {
		const uri = 'file:///test.noo';
		const content = '';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 0);

		const labels = completions.map((item: any) => item.label);
		const expectedKeywords = ['fn', 'if', 'then', 'else', 'match', 'with', 'variant', 'mut', 'constraint', 'implement'];

		for (const keyword of expectedKeywords) {
			expect(labels).toContain(keyword);
		}
	});

	test('completion includes all expected constructors', async () => {
		const uri = 'file:///test.noo';
		const content = '';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 0);

		const labels = completions.map((item: any) => item.label);
		const expectedCtors = ['True', 'False', 'Some', 'None', 'Ok', 'Err'];

		for (const ctor of expectedCtors) {
			expect(labels).toContain(ctor);
		}
	});

	test('analysis uses the latest in-memory document content', async () => {
		const uri = 'file:///not-on-disk.noo';
		await harness.openDocument(uri, 'noolang', 'fn value => 1.0');
		const floatHover = await harness.requestHover(uri, 0, 3);
		expect(JSON.stringify(floatHover)).toContain('Float');

		await harness.changeDocument(uri, 'fn value => "changed"', 2);
		const stringHover = await harness.requestHover(uri, 0, 3);
		expect(JSON.stringify(stringHover)).toContain('String');
	});

	test('completion includes all expected builtins', async () => {
		const uri = 'file:///test.noo';
		const content = '';

		await harness.openDocument(uri, 'noolang', content);

		const completions = await harness.requestCompletion(uri, 0, 0);

		const labels = completions.map((item: any) => item.label);
		const expectedBuiltins = ['head', 'tail', 'map', 'filter', 'reduce', 'length', 'print', 'toString', 'read', 'write', 'log', 'random'];

		for (const builtin of expectedBuiltins) {
			expect(labels).toContain(builtin);
		}
	});
});