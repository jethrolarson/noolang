// Tail-position trampolining for the evaluator — see
// docs/internal/docs-wip/TCO_TRAMPOLINE_PLAN.md for design.
//
// `[fixed]` blocks assert the correct result at a depth that overflows the
// JS stack without the trampoline (measured threshold, bun test v1.3.14
// in-process: 10000 OK, 11000+ overflows). `[characterization]` blocks
// assert behavior that must hold regardless of the trampoline. STRESS_DEPTH
// is one expensive deep case; SHALLOW_OVERFLOW_DEPTH is the cheap depth
// reused across every structural variant instead of repeating the stress
// depth per shape.
import { test, expect, describe } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expectSuccess } from '../utils';

const STRESS_DEPTH = 100000;
// 12000 (a thin margin above the measured 11000 threshold) turned out
// run-to-run flaky — different tail-position shapes carry slightly
// different per-call frame overhead, and 1000 calls of headroom wasn't
// enough. 25000 leaves real margin while still being fast to fail (<1s).
// Kept as the depth for these tests even now that they're fixed (labeled
// `[fixed]` below, not `[red]`) — same rationale: enough that a future
// regression back to non-tail recursion would fail loudly, not flakily.
const SHALLOW_OVERFLOW_DEPTH = 25000;
const SANITY_DEPTH = 10; // confirms a shape is correct before trusting its deep result as "real"

describe('[fixed] self-recursion via top-level `=` (direct application)', () => {
	const src = (n: number) =>
		`count = fn n acc => if n == 0 then acc else count (n - 1) (acc + 1); count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('stress depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(STRESS_DEPTH), STRESS_DEPTH);
	});
});

describe('[fixed] tail call inside `match` (bound pattern variable)', () => {
	const src = (n: number) =>
		`count = fn n acc => match n (0 => acc; rest => count (rest - 1) (acc + 1)); count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
});

describe('[fixed] tail call as the final statement after `;`', () => {
	const src = (n: number) =>
		`count = fn n acc => if n == 0 then acc else (unused = n; count (n - 1) (acc + 1)); count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
});

describe('[fixed] tail call as the `main` expression of a local `where`', () => {
	// The recursive call must be `where`'s *main* expression, not nested in
	// a definition's value — definition values are never tail-evaluated
	// (evaluateWhere/evaluateTailPosition both use plain evaluateExpression
	// for them), so that shape wouldn't exercise this trampoline path.
	const src = (n: number) =>
		`count = fn n acc => if n == 0 then acc else (count (n - 1) (acc + 1) where (unused = 0)); count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
});

describe('[fixed] tail call wrapped in a `typed` ascription', () => {
	const src = (n: number) =>
		`count = fn n acc => if n == 0 then acc else (count (n - 1) (acc + 1) : Float); count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
});

describe('[fixed] tail call wrapped in a `constrained` expression', () => {
	// `given` constraints apply to a type *variable* (`implements` requires an
	// identifier on the left; concrete primitive type names like `Float`
	// lex as KEYWORD tokens, not IDENTIFIER, so `given Float implements Eq`
	// doesn't parse — confirmed via the lexer directly). `a` unifies with
	// `Float` through the constraint machinery.
	const src = (n: number) =>
		`count = fn n acc => if n == 0 then acc else (count (n - 1) (acc + 1) : a given a implements Eq); count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
});

describe('[fixed] multi-parameter curried self-recursion', () => {
	const src2 = (n: number) =>
		`count = fn n acc => if n == 0 then acc else count (n - 1) (acc + 1); count ${n} 0`;
	const src3 = (n: number) =>
		`count = fn n acc step => if n == 0 then acc else count (n - step) (acc + step) step; count ${n} 0 1`;

	test('sanity (2-param): shallow depth succeeds with the correct value', () => {
		expectSuccess(src2(SANITY_DEPTH), SANITY_DEPTH);
	});
	test('sanity (3-param): shallow depth succeeds with the correct value', () => {
		expectSuccess(src3(SANITY_DEPTH), SANITY_DEPTH);
	});

	test('deep depth succeeds with the correct value (2-param, was: overflows)', () => {
		expectSuccess(src2(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
	test('deep depth succeeds with the correct value (3-param, was: overflows)', () => {
		expectSuccess(src3(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
	});
});

describe('[fixed] cross-module tail-recursion depth', () => {
	const dir = path.join(process.cwd(), 'temp_test_modules_tco_depth');

	function setup() {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, 'counter.noo'),
			'count = fn n acc => if n == 0 then acc else count (n - 1) (acc + 1); {@count count}'
		);
	}
	function teardown() {
		fs.rmSync(dir, { recursive: true, force: true });
	}

	const src = (n: number) =>
		`{@count} = import "./temp_test_modules_tco_depth/counter"; count ${n} 0`;

	test('sanity: shallow depth succeeds with the correct value', () => {
		setup();
		try {
			expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH);
		} finally {
			teardown();
		}
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		setup();
		try {
			expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH);
		} finally {
			teardown();
		}
	});
});

describe('[characterization — must stay green before AND after] cross-module ownership', () => {
	// A local function tail-calls an imported function whose body performs a
	// relative import — resolved against the *defining* module's evaluator
	// (`currentFileDir`, evaluator.ts:145), not the caller's. A trampoline
	// that fused the bounce across evaluator instances instead of falling
	// through to a normal `.fn` call would resolve it against the caller's
	// directory instead — existing behavior, must hold regardless of the
	// trampoline.
	const dir = path.join(process.cwd(), 'temp_test_modules_tco_ownership');

	function setup() {
		fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
		fs.writeFileSync(
			path.join(dir, 'sub', 'leaf.noo'),
			'{@marker "correct-sub-dir"}'
		);
		fs.writeFileSync(
			path.join(dir, 'sub', 'helper.noo'),
			'get_marker = fn _unused => ({@marker} = import "./leaf"; marker); {@get_marker get_marker}'
		);
	}
	function teardown() {
		fs.rmSync(dir, { recursive: true, force: true });
	}

	test('a local tail call into an imported closure still resolves the closure\'s own relative imports correctly', () => {
		setup();
		try {
			const src = `
				{@get_marker} = import "./temp_test_modules_tco_ownership/sub/helper";
				local_wrapper = fn x => get_marker x;
				local_wrapper {}
			`;
			expectSuccess(src, 'correct-sub-dir');
		} finally {
			teardown();
		}
	});
});

describe('[characterization — must stay green before AND after] exact-once evaluation', () => {
	// A `mut` counter incremented once per recursive step, via the `;`-left
	// expression in the recursive branch. Catches a trampoline bug that
	// evaluates the tail-call argument or the `;`-left expression more than
	// once (or skips it) while bouncing.
	test('the mutation in a tail-recursive step runs exactly once per call, not zero or twice', () => {
		const src = `
			mut counter = 0;
			bump_and_count = fn n =>
				if n == 0 then counter
				else (mut! counter = counter + 1; bump_and_count (n - 1));
			bump_and_count 25
		`;
		expectSuccess(src, 25);
	});
});

describe('[characterization — must stay green before AND after] environment restoration', () => {
	test('caller bindings survive a deep trampolined call, callee bindings do not leak', () => {
		const src = `
			count = fn n acc => if n == 0 then acc else count (n - 1) (acc + 1);
			caller_local = 999;
			_ = count ${SHALLOW_OVERFLOW_DEPTH} 0;
			caller_local
		`;
		const result = expectSuccess(src, 999);
		// Not just "the returned value is right" — directly check the
		// evaluator's own post-run environment (not the pushed/popped
		// per-call one, the top-level one `evaluateProgram` returns) doesn't
		// contain the callee's parameters (`n`, `acc`) leaked into it.
		expect(result.evalResult.environment.has('n')).toBe(false);
		expect(result.evalResult.environment.has('acc')).toBe(false);
		expect(result.evalResult.environment.has('caller_local')).toBe(true);
	});
});

describe('[fixed] closure-environment switching (tail call into a different closure)', () => {
	// `step` tail-calls a *different* closure, `bump`, which captures its
	// own lexical value (`offset`) and tail-calls back into `step`. Catches
	// a trampoline bug that reuses the current call's environment instead of
	// rebuilding from the target closure's own `tailInfo.env`.
	//
	// `bump` lives in a `where` attached to `step` rather than being a
	// second top-level self-recursive binding: true mutual recursion
	// between top-level bindings doesn't work in noolang today (confirmed —
	// `is_even`/`is_odd` referencing each other fails type-check with
	// "Undefined variable"), so two independently-recursive top-level
	// closures calling each other isn't an available shape.
	const src = (n: number) => `
		step = fn n acc => if n == 0 then acc
			else (bump (n - 1) (acc + offset) where (offset = 1000; bump = fn m a => step m a));
		step ${n} 0
	`;

	test('sanity: shallow depth succeeds and the captured value affects the result', () => {
		expectSuccess(src(SANITY_DEPTH), SANITY_DEPTH * 1000);
	});

	test('deep depth succeeds with the correct value (was: overflows)', () => {
		expectSuccess(src(SHALLOW_OVERFLOW_DEPTH), SHALLOW_OVERFLOW_DEPTH * 1000);
	});
});

describe('[characterization — must stay green before AND after] existing application behavior', () => {
	test('partial application of a 2-parameter function', () => {
		expectSuccess('plus = fn a b => a + b; plus5 = plus 5; plus5 10', 15);
	});

	test('partial application of a 3-parameter function, applied in two steps', () => {
		expectSuccess(
			'sum3 = fn a b c => a + b + c; partial = sum3 1 2; partial 3',
			6
		);
	});

	test('fully saturated 1-parameter call', () => {
		expectSuccess('double = fn a => a * 2; double 21', 42);
	});

	test('fully saturated 3-parameter call in one application chain', () => {
		expectSuccess('sum3 = fn a b c => a + b + c; sum3 1 2 3', 6);
	});
});
