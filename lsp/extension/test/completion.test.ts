/**
 * Completion tests for Noolang LSP server.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { LSPServerHarness } from './harness/LSPServerHarness';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EXPECTED_KEYWORDS = ['fn', 'if', 'then', 'else', 'match', 'with', 'variant', 'mut', 'constraint', 'implement'];
const EXPECTED_CONSTRUCTORS = ['True', 'False', 'Some', 'None', 'Ok', 'Err'];
const EXPECTED_BUILTINS = ['head', 'tail', 'map', 'filter', 'reduce', 'length', 'print', 'toString', 'read', 'write', 'log', 'random'];
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'simple.noo'), 'utf8');

describe('LSP Completion', () => {
	let harness: LSPServerHarness;

	beforeAll(async () => {
		harness = await LSPServerHarness.create();
	});

	afterAll(async () => {
		await harness.close();
	});

	test('completion catalogs contain every expected item with its category', async () => {
		const uri = 'file:///test.noo';
		await harness.openDocument(uri, 'noolang', FIXTURE);

		const completions = await harness.requestCompletion(uri, 0, 0);
		expect(completions).toBeDefined();
		expect(Array.isArray(completions)).toBe(true);
		expect(completions.length).toBeGreaterThan(0);

		const labelsByKind = new Map<number, Set<string>>();
		for (const item of completions) {
			const labels = labelsByKind.get(item.kind) ?? new Set<string>();
			labels.add(item.label);
			labelsByKind.set(item.kind, labels);
		}

		for (const [kind, expected] of [
			[14, EXPECTED_KEYWORDS],
			[4, EXPECTED_CONSTRUCTORS],
			[3, EXPECTED_BUILTINS],
		] as const) {
			const labels = labelsByKind.get(kind) ?? new Set<string>();
			for (const label of expected) {
				expect(labels).toContain(label);
			}
		}
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


	test('analysis uses the latest in-memory document content', async () => {
		const uri = 'file:///not-on-disk.noo';
		await harness.openDocument(uri, 'noolang', 'fn value => 1.0');
		const floatHover = await harness.requestHover(uri, 0, 3);
		expect(JSON.stringify(floatHover)).toContain('Float');

		await harness.changeDocument(uri, 'fn value => "changed"', 2);
		const stringHover = await harness.requestHover(uri, 0, 3);
		expect(JSON.stringify(stringHover)).toContain('String');
	});


	test('preserves relative imports for opened workspace documents', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'noolang-lsp-import-'));
		const mainPath = join(directory, 'main.noo');
		writeFileSync(join(directory, 'dep.noo'), '{@answer 42}');
		const importSource = '{@answer} = import "./dep";\nanswer';
		writeFileSync(mainPath, importSource);
		const repoRoot = join(__dirname, '../../..');
		const importHarness = await LSPServerHarness.create({ workspacePath: repoRoot });
		try {
			const hoverUri = `file://${mainPath}`;
			await importHarness.openDocument(hoverUri, 'noolang', importSource);
			const hover = await importHarness.requestHover(hoverUri, 1, 1);
			expect(JSON.stringify(hover)).toContain('Float');
		} finally {
			await importHarness.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});