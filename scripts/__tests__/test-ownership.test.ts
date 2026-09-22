import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

test('root tests delegate the extension workspace to the dedicated LSP suite', () => {
	const bunfig = readFileSync(resolve(root, 'bunfig.toml'), 'utf8');
	const rootPackage = JSON.parse(
		readFileSync(resolve(root, 'package.json'), 'utf8')
	) as { scripts: Record<string, string> };
	const extensionPackage = JSON.parse(
		readFileSync(resolve(root, 'lsp/extension/package.json'), 'utf8')
	) as { scripts: { test: string } };
	const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

	expect(bunfig).toContain('pathIgnorePatterns = ["lsp/extension/**"]');
	expect(rootPackage.scripts['test:all']).toBe(
		'bun test && bun run test:all-repl && bun run test:lsp'
	);
	expect(rootPackage.scripts['test:all-repl']).toBe(
		'bun run test:repl-simple && bun run test:repl-automation'
	);
	expect(extensionPackage.scripts.test).toBe('bun test');
	expect(workflow).toContain('working-directory: lsp/extension\n      run: npm test');
});
