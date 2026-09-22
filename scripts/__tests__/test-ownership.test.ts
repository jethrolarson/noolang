import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

test('root tests delegate the extension workspace to the dedicated LSP suite', () => {
	const bunfig = readFileSync(resolve(root, 'bunfig.toml'), 'utf8');
	const extensionPackage = JSON.parse(
		readFileSync(resolve(root, 'lsp/extension/package.json'), 'utf8')
	) as { scripts: { test: string } };
	const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

	expect(bunfig).toContain('pathIgnorePatterns = ["lsp/extension/**"]');
	expect(extensionPackage.scripts.test).toBe('bun test');
	expect(workflow).toContain('working-directory: lsp/extension\n      run: npm test');
});
