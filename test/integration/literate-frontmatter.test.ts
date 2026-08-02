// End-to-end proof that the literate `.md` frontmatter (`shadow`/`assert`)
// actually wires together: frontmatter parsing -> TypeState.allowShadowing
// -> the typer's shadow checks, and frontmatter -> Evaluator's
// leaf-granular assertion checking. Unit tests elsewhere stub these pieces
// individually; this is the only place proving the CLI wiring in cli.ts
// works against a real spawned process.
import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const cli = join(repoRoot, 'src', 'cli.ts');

function runFile(content: string): { status: number; out: string } {
	const dir = mkdtempSync(join(tmpdir(), 'literate-frontmatter-'));
	const file = join(dir, 'doc.md');
	writeFileSync(file, content);
	try {
		const out = execFileSync('bun', [cli, file], {
			encoding: 'utf8',
			stdio: 'pipe',
			env: { ...process.env, NO_COLOR: '1' },
		});
		return { status: 0, out };
	} catch (error: any) {
		return {
			status: error.status ?? -1,
			out: String(error.stdout ?? '') + String(error.stderr ?? ''),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const collidingTypes = `
\`\`\`noolang
variant Color = Red | Green | Blue;
\`\`\`

\`\`\`noolang
variant Color = Cyan | Magenta;
\`\`\`
`;

test('colliding type names, no frontmatter: exits non-zero', () => {
	const { status, out } = runFile(collidingTypes);
	expect(status).not.toBe(0);
	expect(out).toContain('shadowing');
});

test('colliding type names, shadow: true frontmatter: exits 0', () => {
	const { status } = runFile(`---\nshadow: true\n---\n${collidingTypes}`);
	expect(status).toBe(0);
});

const assertions = `
\`\`\`noolang
1 + 2;  # => 3 : Float
1 + 2;  # => 99 : Float
\`\`\`
`;

test('assert: true with a wrong annotation: exits non-zero and reports it', () => {
	const { status, out } = runFile(`---\nassert: true\n---\n${assertions}`);
	expect(status).not.toBe(0);
	expect(out).toContain('Assertion failed');
});

test('assert: true with correct annotations: exits 0', () => {
	const { status } = runFile(
		`---\nassert: true\n---\n\`\`\`noolang\n1 + 2;  # => 3 : Float\n\`\`\`\n`
	);
	expect(status).toBe(0);
});
