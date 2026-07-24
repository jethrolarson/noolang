/**
 * Module resolution Phase 2 tests.
 *
 * Map to spec goal→proof table:
 *   RELDIR    - nested-directory relative import resolves correctly (not CWD-relative)
 *   SYMLINK   - symlink alias hits one cache entry
 *   IMPORTMAP - bare specifier resolves via noolang.json import map
 *   BARE-ERR  - bare specifier with no map entry → clear error
 *   STDLIB-CWD- running from a different CWD still finds stdlib (regression guard)
 *   ABSPATH   - absolute-path import warns but proceeds
 *   STD-STUB  - std/* imports give a clear "deferred" error
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCode, parseAndType } from '../utils';
import { clearModuleCache, resolveModulePath } from '../../src/module-loader';

// ─── helpers ───────────────────────────────────────────────────────────────────

const TMPDIR = path.join(process.cwd(), '.test-tmp-resolution-p2');

function writeTmp(relPath: string, content: string): string {
	const fullPath = path.join(TMPDIR, relPath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, 'utf8');
	return fullPath;
}

beforeEach(() => {
	fs.mkdirSync(TMPDIR, { recursive: true });
	clearModuleCache();
});

afterEach(() => {
	try {
		fs.rmSync(TMPDIR, { recursive: true, force: true });
	} catch (_) {
		// ignore
	}
});

// ─── RELDIR: nested-directory relative import ─────────────────────────────────

describe('RELDIR: nested-directory relative import resolves correctly', () => {
	test('importer in nested dir can import ./sibling via relative path', () => {
		// lib.noo lives next to importer.noo
		writeTmp('nested/lib.noo', `{@value 99}`);

		// importer.noo is in TMPDIR/nested/ and imports ./lib
		writeTmp(
			'nested/importer.noo',
			`lib = import "./lib";
{@result (@value lib)}`
		);

		// Top-level code imports importer via absolute path
		const importerSpec = path.join(TMPDIR, 'nested', 'importer');
		const code = `m = import "${importerSpec}"; @result m`;
		const result = runCode(code);
		expect(result.finalValue).toBe(99);
	});

	test('relative import fails if ./prefix is missing (bare specifier, no map entry)', () => {
		writeTmp('bare_sibling.noo', `{@x 1}`);

		// Import using bare specifier (no ./ prefix) from a module in TMPDIR
		// Since there is no noolang.json in TMPDIR, this should error clearly.
		writeTmp(
			'bare_importer.noo',
			`import "bare_sibling"`
		);
		const importerSpec = path.join(TMPDIR, 'bare_importer');
		const code = `import "${importerSpec}"`;
		// bare_sibling has no import-map entry → error
		expect(() => parseAndType(code)).toThrow(/bare specifier|import map|noolang\.json/i);
	});

	test('./path resolves against importing file directory, not CWD', () => {
		// If CWD is project root, a module in TMPDIR/deep/foo.noo should resolve
		// ./bar correctly to TMPDIR/deep/bar.noo, NOT <cwd>/bar.noo
		writeTmp('deep/bar.noo', `{@v 777}`);
		writeTmp(
			'deep/foo.noo',
			`b = import "./bar"; @v b`
		);
		const fooSpec = path.join(TMPDIR, 'deep', 'foo');
		const code = `import "${fooSpec}"`;
		const result = runCode(code);
		expect(result.finalValue).toBe(777);
	});
});

// ─── SYMLINK: symlink alias hits one cache entry ───────────────────────────────

describe('SYMLINK: symlink alias hits one cache entry', () => {
	test('symlink and original resolve to one cache entry (type identity — no false ADT conflict)', () => {
		// A module that DEFINES a type. Behavioural proof of realpath dedup:
		// without canonical-realpath cache keying, importing it via two aliases
		// yields two definingPaths for `Box` → the coherence merge would raise an
		// ADT-identity conflict. Dedup ⇒ one path ⇒ no error.
		const origPath = writeTmp('sym_orig.noo', `variant Box = Box Float; { @mk Box }`);

		const symlinkPath = path.join(TMPDIR, 'sym_alias.noo');
		fs.symlinkSync(origPath, symlinkPath);

		const origSpec = path.join(TMPDIR, 'sym_orig');
		const symlinkSpec = path.join(TMPDIR, 'sym_alias');

		const code = `
{ @mk mk1 } = import "${origSpec}";
{ @mk mk2 } = import "${symlinkSpec}";
mk1 1
`;
		// No ADT-identity conflict ⇒ the aliases collapsed to one cache entry.
		expect(() => runCode(code)).not.toThrow();

		// Mechanism sanity: both aliases canonicalise to the same real path.
		expect(fs.realpathSync(origPath)).toBe(fs.realpathSync(symlinkPath));
	});
});

// ─── IMPORTMAP: bare specifier resolves via noolang.json ─────────────────────

describe('IMPORTMAP: bare specifier resolves via noolang.json', () => {
	test('exact-match bare specifier resolves via import map', () => {
		writeTmp('mylib.noo', `{@greet "hello"}`);

		// Write noolang.json in TMPDIR
		writeTmp(
			'noolang.json',
			JSON.stringify({ imports: { mylib: './mylib.noo' } })
		);

		// A module in TMPDIR that imports 'mylib' (bare, no ./)
		writeTmp(
			'user.noo',
			`m = import "mylib"; @greet m`
		);

		const userSpec = path.join(TMPDIR, 'user');
		const code = `import "${userSpec}"`;
		const result = runCode(code);
		expect(result.finalValue).toBe('hello');
	});

	test('prefix-match bare specifier resolves via import map (trailing slash)', () => {
		writeTmp('libs/math.noo', `{@pi 3}`);

		// Map "libs/" prefix to ./libs/
		writeTmp(
			'noolang.json',
			JSON.stringify({ imports: { 'libs/': './libs/' } })
		);

		writeTmp(
			'user2.noo',
			`m = import "libs/math"; @pi m`
		);

		const user2Spec = path.join(TMPDIR, 'user2');
		const code = `import "${user2Spec}"`;
		const result = runCode(code);
		expect(result.finalValue).toBe(3);
	});

	test('import-map entries resolve relative to map file, not CWD', () => {
		// The noolang.json lives in a subdirectory; its entries must resolve
		// relative to THAT directory, not to process.cwd().
		writeTmp('sub/target.noo', `{@answer 42}`);

		// Place the import map in sub/ with an entry relative to it
		writeTmp(
			'sub/noolang.json',
			JSON.stringify({ imports: { target: './target.noo' } })
		);

		// User module is in sub/ and imports the bare specifier 'target'
		writeTmp(
			'sub/user.noo',
			`m = import "target"; @answer m`
		);

		const userSpec = path.join(TMPDIR, 'sub', 'user');
		const code = `import "${userSpec}"`;
		const result = runCode(code);
		expect(result.finalValue).toBe(42);
	});

	test('examples/ prefix mapping works (regression: existing module tests)', () => {
		// This is the key regression: "examples/math_module" used to resolve via CWD.
		// Phase 2 requires a noolang.json with examples/ → ./examples/.
		// The project root noolang.json provides this mapping.
		const code = `
{@add, @multiply} = import "examples/math_module";
add 3 4
`;
		const result = runCode(code);
		expect(result.finalValue).toBe(7);
	});
});

// ─── BARE-ERR: bare specifier with no map entry → clear error ────────────────

describe('BARE-ERR: bare specifier with no import-map entry → clear error', () => {
	test('bare specifier not in map errors with the specifier name', () => {
		// No noolang.json anywhere up from TMPDIR (above project root won't be found
		// before the project root's noolang.json, but that only has "examples/")
		writeTmp('unrelated.noo', `{@x 1}`);
		writeTmp(
			'uses_unregistered.noo',
			`import "some_unknown_lib"`
		);
		const spec = path.join(TMPDIR, 'uses_unregistered');
		const code = `import "${spec}"`;
		expect(() => parseAndType(code)).toThrow(/some_unknown_lib|bare specifier|import map/i);
	});

	test('bare specifier that looks like a path but has no ./ prefix errors clearly', () => {
		// A specifier like "utils/math" without ./ is a bare specifier, not relative
		writeTmp('utils/math.noo', `{@x 1}`);
		writeTmp(
			'importer.noo',
			`import "utils/math"`
		);
		const spec = path.join(TMPDIR, 'importer');
		const code = `import "${spec}"`;
		expect(() => parseAndType(code)).toThrow(/utils\/math|bare specifier|import map/i);
	});
});

// ─── STD: std/* resolves to modules shipped with the interpreter ─────────────

describe('STD: std/* resolves to shipped modules', () => {
	test('import "std/test" resolves to the shipped test module', () => {
		const result = parseAndType(`{@expect_eq} = import "std/test"; expect_eq`);
		expect(result.type).toBeDefined();
	});

	test('import of a nonexistent std module names the missing module', () => {
		expect(() => parseAndType(`import "std/no-such-module"`)).toThrow(
			/no-such-module/
		);
	});

	test('import "std" (exact) is an error', () => {
		expect(() => parseAndType(`import "std"`)).toThrow(/std/i);
	});
});

// ─── ABSPATH: absolute-path import warns but proceeds ────────────────────────

describe('ABSPATH: absolute-path import warns but does not throw', () => {
	test('absolute path import resolves and warns (portability advisory)', () => {
		// Absolute paths are a portability trap: they are machine-local and will
		// break on other machines or CI. Phase 2 policy: warn and proceed (not
		// forbid) so existing tests that use absolute paths remain compatible.
		const libPath = writeTmp('abs_lib.noo', `{@x 55}`);

		// Import using the absolute path directly
		const code = `m = import "${libPath.replace(/\.noo$/, '')}"; @x m`;
		// Should succeed (warning is emitted to stderr, not thrown)
		const result = runCode(code);
		expect(result.finalValue).toBe(55);
	});
});

// ─── STDLIB-CWD: running from a different CWD still finds stdlib ──────────────

describe('STDLIB-CWD: stdlib loads regardless of working directory', () => {
	test('running a .noo file from /tmp (different CWD) finds stdlib', () => {
		// This guards against the bug where the evaluator tried CWD-relative stdlib paths.
		// The fix uses __dirname-relative paths so stdlib is always found.
		const nooFile = writeTmp(
			'cwd_test.noo',
			`map (fn x => x + 1) [1, 2, 3]`
		);

		// Find the CLI
		const projectRoot = path.join(__dirname, '..', '..');
		const cliPath = path.join(projectRoot, 'src', 'cli.ts');

		// Run from /tmp (a directory that does NOT contain stdlib.noo)
		// --verbose: plain execution no longer auto-prints the final value.
		const result = spawnSync('bun', [cliPath, '--verbose', nooFile], {
			cwd: '/tmp',
			timeout: 30000,
			encoding: 'utf8',
		});

		// Should succeed with output
		if (result.status !== 0) {
			throw new Error(
				`CLI failed from /tmp CWD.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
			);
		}
		expect(result.status).toBe(0);
		// Output should contain the list representation
		expect(result.stdout).toMatch(/\[2, 3, 4\]|\[2,3,4\]/);
	});

	test('typeAndDecorate succeeds regardless of CWD (typer stdlib path is __dirname-relative)', () => {
		// The type-operations.ts loadStdlib always uses __dirname-relative paths
		// independent of CWD. Verify stdlib symbols like `map` are available.
		// If this throws "Undefined variable: map", stdlib didn't load.
		expect(() => parseAndType(`map (fn x => x + 1) [1, 2]`)).not.toThrow();
	});
});
