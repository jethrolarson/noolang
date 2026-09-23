import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import packageJson from '../package.json';
import { LSPServerHarness } from './harness/LSPServerHarness';

const repoRoot = join(__dirname, '../../..');
let harness: LSPServerHarness | undefined;

afterEach(async () => {
	await harness?.close();
	harness = undefined;
});

describe('LSP server protocol', () => {
	test('reports the extension package version during initialization', async () => {
		harness = new LSPServerHarness({ workspacePath: repoRoot });

		const result = await harness.initialize();

		expect(result.serverInfo?.version).toBe(packageJson.version);
	});

	test('offers infer annotation actions for a large AST at a path with spaces', async () => {
		const tempDirectory = mkdtempSync(
			join(tmpdir(), 'noolang lsp regression-')
		);
		const linkedWorkspace = join(tempDirectory, 'workspace with spaces');
		symlinkSync(repoRoot, linkedWorkspace, 'dir');
		harness = await LSPServerHarness.create({ workspacePath: repoRoot });

		try {
			const jsonPath = join(linkedWorkspace, 'std', 'json.noo');
			const uri = pathToFileURL(jsonPath).toString();
			const targetLine = readFileSync(jsonPath, 'utf8')
				.split('\n')
				.findIndex((line) => line.startsWith('is_supported_escape ='));
			expect(targetLine).toBeGreaterThanOrEqual(0);

			const actions = await harness.requestCodeActions(uri, targetLine, 0);

			expect(actions).toHaveLength(1);
			expect(actions[0].title).toBe('Infer type annotation');
			expect(actions[0].edit.changes[uri]).toHaveLength(1);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});
});
