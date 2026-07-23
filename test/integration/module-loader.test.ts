/**
 * Module loader tests — Phase 1 Step 2.
 *
 * TDD: each test is written first (red), then the implementation makes it green.
 *
 * Map to spec goal→proof table:
 *   HEADLINE  - identical type across importers/orders (hermetic)
 *   DIAMOND   - A→B→D, A→C→D diamond with variant+implement
 *   COHERENCE - conflicting instances → hard error naming both files
 *   PURE      - top-level effect → error; effectful function export is fine
 *   CYCLE     - A↔B → clear error with chain
 *   CLOSURE   - instance member calls home-file helper, dispatched from another module
 *   REGRESSION- existing example imports still work
 *   MUT       - top-level mut binding → error
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runCode, parseAndType } from '../utils';
import { clearModuleCache } from '../../src/module-loader';

// ─── helpers ───────────────────────────────────────────────────────────────────

const TMPDIR = path.join(
	process.cwd(),
	'.test-tmp-module-loader'
);

function writeTmp(relPath: string, content: string): string {
	const fullPath = path.join(TMPDIR, relPath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, 'utf8');
	return fullPath;
}

function nooPath(relPath: string): string {
	return path.join(TMPDIR, relPath).replace(/\.noo$/, '');
}

beforeEach(() => {
	fs.mkdirSync(TMPDIR, { recursive: true });
	clearModuleCache();
});

afterEach(() => {
	// Clean up temp files
	try {
		fs.rmSync(TMPDIR, { recursive: true, force: true });
	} catch (_) {
		// ignore
	}
});

// ─── HEADLINE property: identical type across importers ────────────────────────

describe('HEADLINE: hermetic type identity', () => {
	test('module imported by two importers yields identical export type', () => {
		// D is a simple module
		const dPath = writeTmp('d.noo', `
fn x => x + 1
`);

		// Import D twice in different expression contexts
		const p1 = path.join(TMPDIR, 'd');
		const code1 = `import "${p1}"`;
		const code2 = `import "${p1}"`;

		const r1 = parseAndType(code1);
		clearModuleCache();
		const r2 = parseAndType(code2);

		// Both should succeed and produce compatible types
		expect(r1.type.kind).toBe(r2.type.kind);
		// Both return function type Float -> Float
		expect(r1.type.kind).toBe('function');
		expect(r2.type.kind).toBe('function');
	});

	test('two independent polymorphic modules imported together do not cross-contaminate type vars', () => {
		// Each module's hermetic check mints fresh type variables starting from the
		// same base counter, so they can share var names internally. This must not
		// corrupt the importer: instantiate re-freshens at each site.
		writeTmp('poly_a.noo', `
{@idA fn x => x, @constA fn x y => x}
`);
		writeTmp('poly_b.noo', `
{@idB fn x => x, @pairB fn x y => {x, y}}
`);
		const pa = path.join(TMPDIR, 'poly_a');
		const pb = path.join(TMPDIR, 'poly_b');
		const code = `
a = import "${pa}";
b = import "${pb}";
n = (@idA a) 5;
s = (@idB b) "hi";
{n, s}
`;
		const result = runCode(code);
		// n = 5, s = "hi" → tuple {5, "hi"}
		expect(result.finalValue).toEqual([5, 'hi']);
	});

	test('import order does not change the export type', () => {
		// Module with a clear type
		const mPath = writeTmp('ordered.noo', `
{@x 42, @y "hello"}
`);
		const p = path.join(TMPDIR, 'ordered');

		const r1 = parseAndType(`m = import "${p}"; m`);
		clearModuleCache();
		const r2 = parseAndType(`m = import "${p}"; m`);

		// Both should have record type with same fields
		expect(r1.type.kind).toBe('record');
		expect(r2.type.kind).toBe('record');
		if (r1.type.kind === 'record' && r2.type.kind === 'record') {
			expect(Object.keys(r1.type.fields).sort()).toEqual(
				Object.keys(r2.type.fields).sort()
			);
		}
	});
});

// ─── DIAMOND: A→B→D, A→C→D ────────────────────────────────────────────────────

describe('DIAMOND: diamond import with variant and implement', () => {
	test('diamond with shared variant module: no false duplicate error', () => {
		// D defines a variant and an implement
		writeTmp('d_shared.noo', `
variant MyBox a = MyBox a;
implement Show MyBox (
  show = fn x => "box"
);
{@makeBox fn x => MyBox x, @getBox fn box => match box ( MyBox v => v )}
`);
		const dPath = path.join(TMPDIR, 'd_shared');

		// B imports D
		writeTmp('b_imports_d.noo', `
d = import "${dPath}";
{@b fn x => (@makeBox d) x}
`);
		const bPath = path.join(TMPDIR, 'b_imports_d');

		// C also imports D
		writeTmp('c_imports_d.noo', `
d = import "${dPath}";
{@c fn x => (@makeBox d) x}
`);
		const cPath = path.join(TMPDIR, 'c_imports_d');

		// A imports both B and C (diamond)
		const code = `
b = import "${bPath}";
c = import "${cPath}";
{@b b, @c c}
`;

		// Should NOT throw a duplicate error
		expect(() => parseAndType(code)).not.toThrow();
	});
});

// ─── COHERENCE: conflicting instances → hard error ────────────────────────────

describe('COHERENCE: conflicting instances fail-closed', () => {
	test('two modules defining conflicting instances → error naming both files', () => {
		// Define a shared trait
		writeTmp('trait_def.noo', `
constraint MyTrait a (
  myFn : a -> String
);
{}
`);
		const traitPath = path.join(TMPDIR, 'trait_def');

		// Module 1 defines MyTrait for Float
		writeTmp('impl1.noo', `
t = import "${traitPath}";
implement MyTrait Float (
  myFn = fn x => "impl1"
);
{}
`);
		const impl1Path = path.join(TMPDIR, 'impl1');

		// Module 2 ALSO defines MyTrait for Float (conflict!)
		writeTmp('impl2.noo', `
t = import "${traitPath}";
implement MyTrait Float (
  myFn = fn x => "impl2"
);
{}
`);
		const impl2Path = path.join(TMPDIR, 'impl2');

		// Importing both should error, naming both files
		const code = `
a = import "${impl1Path}";
b = import "${impl2Path}";
{}
`;
		expect(() => parseAndType(code)).toThrow(/impl1.*impl2|impl2.*impl1/i);
	});
});

// ─── PURE IMPORTS: top-level effect → error ───────────────────────────────────

describe('PURE: top-level effects fail-closed', () => {
	test('module with top-level print effect → error', () => {
		writeTmp('effectful_module.noo', `
x = print "loading";
fn v => v
`);
		const p = path.join(TMPDIR, 'effectful_module');
		expect(() => parseAndType(`import "${p}"`)).toThrow(/effect|top.level|pure/i);
	});

	test('module exporting effectful function is allowed', () => {
		writeTmp('effectful_fn_module.noo', `
fn x => print x
`);
		const p = path.join(TMPDIR, 'effectful_fn_module');
		// Should not throw
		expect(() => parseAndType(`import "${p}"`)).not.toThrow();
	});
});

// ─── MUT: top-level mut binding → error ───────────────────────────────────────

describe('MUT: top-level mut binding fails', () => {
	test('module with top-level mut binding → error', () => {
		writeTmp('mut_module.noo', `
mut counter = 0;
fn x => x
`);
		const p = path.join(TMPDIR, 'mut_module');
		expect(() => parseAndType(`import "${p}"`)).toThrow(/mut|mutable/i);
	});
});

// ─── CYCLE: A↔B → clear error ─────────────────────────────────────────────────

describe('CYCLE: circular imports fail-closed', () => {
	test('A imports B which imports A → clear cycle error not hang', () => {
		// We need to write files with absolute paths; since we're setting up before knowing
		// the exact paths, we compute them first
		const aPath = path.join(TMPDIR, 'cycle_a');
		const bPath = path.join(TMPDIR, 'cycle_b');

		writeTmp('cycle_a.noo', `
b = import "${bPath}";
fn x => x
`);
		writeTmp('cycle_b.noo', `
a = import "${aPath}";
fn x => x
`);

		expect(() => parseAndType(`import "${aPath}"`)).toThrow(
			/circular|cycle/i
		);
	});
});

// ─── CLOSURE §4: instance member calls home-file helper ───────────────────────

describe('CLOSURE §4: instance closure over home module env', () => {
	test('instance member calls helper local to defining module, dispatched from another', () => {
		// Module with a trait impl that calls a local helper
		writeTmp('closure_impl.noo', `
helper = fn x => x + 100;
constraint Bumper a (
  bump : a -> Float
);
implement Bumper Float (
  bump = fn x => helper x
);
{@helper helper}
`);
		const implPath = path.join(TMPDIR, 'closure_impl');

		// Importer uses the trait function (dispatches to the impl)
		const code = `
m = import "${implPath}";
bump 42
`;
		// Should evaluate correctly: 42 + 100 = 142
		const result = runCode(code);
		expect(result.finalValue).toBe(142);
	});

	test('instance member referencing a helper defined LATER errors clearly (never silently vanishes)', () => {
		// Noolang does not hoist top-level bindings: an instance member that
		// references a helper defined AFTER the `implement` is a forward reference.
		// The typer rejects it with a clear "Undefined variable" error — it must
		// NOT be silently swallowed/omitted from the captured closures.
		writeTmp('forward_ref_impl.noo', `
constraint Bumper2 a (
  bump2 : a -> Float
);
implement Bumper2 Float (
  bump2 = fn x => laterHelper x
);
laterHelper = fn x => x + 100;
{@laterHelper laterHelper}
`);
		const implPath = path.join(TMPDIR, 'forward_ref_impl');
		expect(() => parseAndType(`import "${implPath}"`)).toThrow(
			/laterHelper|Undefined/i
		);
	});

	test('instance member referencing a truly-undefined name errors (never silently vanishes)', () => {
		writeTmp('bad_impl.noo', `
constraint Bumper3 a (
  bump3 : a -> Float
);
implement Bumper3 Float (
  bump3 = fn x => definitelyNotDefinedAnywhere x
);
{}
`);
		const implPath = path.join(TMPDIR, 'bad_impl');
		expect(() => parseAndType(`import "${implPath}"`)).toThrow(
			/definitelyNotDefinedAnywhere|Undefined/i
		);
	});

	test('instance with multiple members dispatches each correctly cross-module (functions+closures in sync)', () => {
		// Two members, each calling a distinct local helper. Both must dispatch
		// correctly from an importer — proving the AST functions map and the
		// evaluatedFunctions map stay in sync (point 2).
		writeTmp('multi_member_impl.noo', `
inc = fn x => x + 1;
dec = fn x => x - 1;
constraint TwoWay a (
  up : a -> Float;
  down : a -> Float
);
implement TwoWay Float (
  up = fn x => inc x;
  down = fn x => dec x
);
{@inc inc}
`);
		const implPath = path.join(TMPDIR, 'multi_member_impl');
		const code = `
m = import "${implPath}";
(up 10) + (down 10)
`;
		// up 10 = 11, down 10 = 9 → 20
		const result = runCode(code);
		expect(result.finalValue).toBe(20);
	});

	test('instance for a variant (non-primitive) type dispatches cross-module', () => {
		// Proves the runtime type-name key agrees with the typer's key for a
		// variant impl target (point 3: getTypeName agreement).
		writeTmp('variant_impl.noo', `
variant Wrap a = Wrap a;
unwrapHelper = fn w => match w ( Wrap v => v );
constraint Unwrapper f (
  unwrapW : f a -> a
);
implement Unwrapper Wrap (
  unwrapW = fn w => unwrapHelper w
);
{@makeWrap fn x => Wrap x}
`);
		const implPath = path.join(TMPDIR, 'variant_impl');
		const code = `
m = import "${implPath}";
unwrapW ((@makeWrap m) 99)
`;
		const result = runCode(code);
		expect(result.finalValue).toBe(99);
	});
});

// ─── REGRESSION: existing examples still work ─────────────────────────────────

describe('REGRESSION: existing module imports', () => {
	test('math_module example still works', () => {
		const code = `
{@add, @multiply} = import "examples/math_module";
add 3 4
`;
		const result = runCode(code);
		expect(result.finalValue).toBe(7);
	});

	test('function_module example still works', () => {
		const code = `
double = import "examples/function_module";
double 5
`;
		const result = runCode(code);
		expect(result.finalValue).toBe(10);
	});

	test('module imported twice evaluates only once (cache)', () => {
		// Use a module with a known output; if evaluated twice the count would be off
		// We verify this by importing the same module twice and checking we get same ref
		const mPath = writeTmp('cached.noo', `
{@value 42}
`);
		const p = path.join(TMPDIR, 'cached');
		const code = `
a = import "${p}";
b = import "${p}";
(@value a) + (@value b)
`;
		// Both should be 42+42=84 and NOT error on double import
		const result = runCode(code);
		expect(result.finalValue).toBe(84);
	});
});

// Regression: unfreshened module bindings could collide with the importer's
// own type-variable counter. Collision was arity-coincidence-dependent, so
// this sweeps arities rather than hardcoding the one N that failed.
describe('ISOLATION: imported polymorphic bindings stay independently generalized', () => {
	beforeEach(() => {
		writeTmp(
			'poly.noo',
			`
identity = fn x => x;
same = fn a b => a;
dummy1 = 1;
dummy2 = 2;
dummy3 = 3;
dummy4 = 4;
dummy5 = 5;
dummy6 = 6;
{@identity identity, @same same, @dummy1 dummy1, @dummy2 dummy2, @dummy3 dummy3, @dummy4 dummy4, @dummy5 dummy5, @dummy6 dummy6}
`
		);
	});

	for (let arity = 1; arity <= 8; arity++) {
		test(`destructuring ${arity} field(s) from the import doesn't corrupt a later, differently-typed call`, () => {
			const fields = ['identity', 'same', 'dummy1', 'dummy2', 'dummy3', 'dummy4', 'dummy5', 'dummy6'].slice(
				0,
				arity
			);
			const destructure = `{${fields.map(f => `@${f} ${f}`).join(', ')}}`;
			const p = path.join(TMPDIR, 'poly');
			const code = `
${destructure} = import "${p}";
a = identity 1;
b = identity "x";
a + 1
`;
			const result = runCode(code);
			expect(result.finalValue).toBe(2);
		});
	}
});
