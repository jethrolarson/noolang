# Tail-position trampolining for the noolang evaluator — implementation plan

Status: implemented and verified. `src/evaluator/evaluator.ts`
(`evaluateTailPosition`, `runTrampolined`, `TailCall`) and
`src/evaluator/evaluator-utils.ts` (`Environment` moved here, `FunctionValue
.tailInfo`, `createFunction`'s second argument). Tests:
`test/features/tail-call-optimization.test.ts` (27 tests — `[fixed]` blocks
were written and confirmed red before the trampoline existed, then flipped
to asserting correct deep-call results; `[characterization]` blocks were
green throughout). Full suite, typecheck, doc validation, and
`stdlib.test.noo` all clean; the one pre-existing LSP hover failure is
unrelated (confirmed present on the base commit via `git stash`, before any
of this work). See "Shared-logic refactor — retracted" below for a
mid-implementation design change worth reading before touching this code
again.

Post-implementation review found and fixed: a semantic-parity gap where
`evaluateTailPosition`'s application case handled a hypothetical multi-arg
AST node differently than `evaluateApplication` (scoped fix: bounce only
for `args.length === 1`, defer entirely otherwise); the `Environment` type
move dropping its public re-export from `evaluator.ts` (restored);
`createFunction` always adding an own `tailInfo: undefined` property (fixed
to omit the key when absent); an unused `Cell` import; a misleading
`runTrampolined` comment; and two tests that didn't verify what their names
claimed (a "runtime error" test that never actually threw, later removed
entirely rather than reworked — no well-typed runtime throw was found in
stdlib to build a real version on, proving it required hand-rolling the
eval pipeline against AGENTS.md's test-helper rule, and even then it only
proved a second program still ran, not that state was actually clean; and a
"deep" test that was using `SANITY_DEPTH`, fixed to use the real deep
depth with a direct environment-state assertion).

Revised after design review before implementation began.

Scope note (per review point D1): this is **syntactic tail-position
trampolining** for a fixed set of node shapes (direct application, `if`,
`match`, `where`, `;`, `typed`/`constrained` wrappers, single-step
`pipeline`) — not general semantic tail-call support. `$`, `|`, and the
evaluated branch of `&&`/`||` are real tail positions too but are explicitly
out of scope (see Non-goals).

## Context

Noolang's evaluator is tree-walking; a noolang function call is a JS function
call (`evaluateExpression` → `evaluateApplication` → closure `.fn(arg)` →
`evaluateExpression(body)` → ...). Self-tail-recursive call chains overflow
the JS stack at depth on the order of a few thousand calls (exact threshold
is runtime/context-dependent, not a fixed constant — see Verification).
Hit for real in `std/json.noo`'s string parser (fixed
with a `reduce`-based workaround in PR #188) and documented as a language gap
in `docs/internal/ideas/TAIL_CALL_OPTIMIZATION.md` (merged, PR #189). A
companion idea doc for a further-future bytecode/VM rewrite has been written
(`docs/internal/ideas/BYTECODE_VM_REWRITE.md`) — out of scope here; this plan
is the smaller, scoped fix: make tail calls not grow the JS stack, without
rearchitecting the evaluator.

Three strategic options were considered (targeted trampoline vs. full CPS
rewrite vs. bytecode/explicit-stack VM). This plan is the first — smallest
blast radius, fixes the concrete problem that's actually been hit. The other
two are filed as their own idea docs, not started.

## Design

**Function representation.** `FunctionValue` (`src/evaluator/evaluator-utils.ts`)
gets an optional field:
```ts
tailInfo?: { param: string; body: Expression; env: Environment; owner: unknown };
```
`owner` is the identity of the `Evaluator` instance that created the closure
(pass `this` from `evaluateFunction`, typed `unknown` in `evaluator-utils.ts`
to avoid importing `Evaluator` there — compared by reference only, never
introspected). **Required, not optional** — see the cross-evaluator-ownership
issue below; this is the fix for review blocker B1, not an incidental field.

`env` is the closure environment *before* the final parameter is bound — i.e.
exactly the `closureEnv`/`callEnv` variable already in scope at the two spots
in `evaluateFunction`'s `createCurriedFunction` (`evaluator.ts:1943-1996`)
where a closure is about to evaluate the function body (the `params.length
=== 1` branch and the nested `remainingParams.length === 1` branch — the two
"terminal" closures, one per arity). Every other `createFunction(...)` call
site (pipeline composition, ADT constructors, native wrappers) leaves
`tailInfo` unset — untouched, no behavior change, they were never the deep-
recursion case.

The `Environment` type currently lives in `evaluator.ts` (`export type
Environment = Map<string, Value | Cell>`, line 117); move it into
`evaluator-utils.ts` (where `Cell` already lives) so `evaluator-utils.ts` can
reference it in `FunctionValue` without a circular import. `evaluator.ts`
re-imports it from there like it does `Cell`/`Value`.

**Tail-position dispatcher.** New method `evaluateTailPosition(expr):
Value | TailCall` in `Evaluator`, structurally mirroring `evaluateExpression`
but only for node kinds that preserve tail position, recursing into itself
(plain TS recursion — bounded by the *static* nesting depth of one function
body, not by call count, so this is safe):

- `if`: eval `condition` via `evaluateExpression` (non-tail), tail-recurse
  into `then`/`else` via `evaluateTailPosition`.
- `match`: eval scrutinee via `evaluateExpression`, on match tail-recurse into
  `matchCase.expression` (inside the existing `withNewEnvironment` binding
  wrapper — pattern bindings, same as `evaluateMatch` today).
- `where`: eval definitions same as `evaluateWhere` today, tail-recurse into
  `expr.main`.
- `binary` with operator `;`: eval `left` via `evaluateExpression`, tail-
  recurse into `right`. Every other binary operator (`+`, `==`, `|`, `$`,
  `&&`, ...) falls through to plain `evaluateExpression(expr)` — not tail-call
  shaped, out of scope (see Non-goals).
- `pipeline` with exactly one step: tail-recurse into that step. Multi-step
  pipelines build a composed closure, not a call — fall through.
- `typed` / `constrained`: transparent, tail-recurse into the wrapped
  expression (annotations are erased at runtime already).
- `application`: the actual bounce point. Evaluate `expr.func` via
  `evaluateExpression` (non-tail — matches existing semantics; trait-function
  values fall back to the existing `evaluateTraitFunctionApplication`, no
  tail optimization there, out of scope). Then loop `expr.args` the same
  shape as `evaluateApplication`'s existing loop (`evaluator.ts:2012-2028`),
  evaluating each arg via `evaluateExpression`, applying all but the last
  normally (`current.fn(arg)`) — except on the *last* arg, if `current` is a
  `FunctionValue` with `tailInfo` set **and `tailInfo.owner === this`**
  (same evaluator instance — see Cross-evaluator ownership below), return a
  `TailCall` marker instead of calling `.fn`:
  ```ts
  type TailCall = { tailcall: true; param: string; body: Expression; env: Environment; arg: Value };
  ```
  If `tailInfo` is set but the owner differs (a tail call into a closure
  exported from a different module — each module gets its own `Evaluator`,
  `src/module-loader.ts:622-626`), fall through to `current.fn(arg)` exactly
  as the non-tail path does. That evaluator instance runs its *own*
  trampoline loop internally for its own body — correct, just not folded
  into the caller's loop. Bouncing across owners would run the callee body
  through the caller's `evaluateTailPosition`/environment stack/trait
  registry/`constructorVariants`, all of which are per-`Evaluator` state —
  wrong dispatch, not just a missed optimization.
  (In practice the parser only ever produces single-arg `application` nodes —
  confirmed via `src/parser/parser.ts:866-880` and `:678-692`, juxtaposition
  is left-folded into nested single-arg nodes — but looping `expr.args` costs
  nothing and doesn't assume that stays true.)
- Everything else (literal, variable, record, tuple, list, accessor,
  definition, mutation, import, ...): fall through to `evaluateExpression`.
  These don't make saturating tail calls themselves.

**Invariant:** a `TailCall` marker must never escape a `.fn(arg)` call. It's
only ever produced by `evaluateTailPosition`, and only ever consumed by (a)
`evaluateTailPosition`'s own recursive calls into itself, or (b) the
trampoline loop below. `evaluateExpression`'s `'application'` case keeps
calling the existing, unmodified `evaluateApplication` — normal (non-tail)
calls are completely unaffected.

**The trampoline itself.** Replace the two `self.evaluateExpression(body)`
call sites in `createCurriedFunction` (`evaluator.ts:1955-1958` and
`:1968-1971`) with a loop, still wrapped in a single `withNewEnvironment` per
*logical* call (not per iteration — matters both for correctness, since
`environmentStack` shouldn't grow per trampoline bounce, and for not
defeating the point of the exercise):
```ts
result = self.withNewEnvironment(() => {
  let currentBody = body;
  let currentEnv = callEnv;
  for (;;) {
    self.environment = currentEnv;
    const r = self.evaluateTailPosition(currentBody);
    if (!isTailCall(r)) return r;
    const nextEnv = new Map(r.env);
    nextEnv.set(r.param, r.arg);
    currentBody = r.body;
    currentEnv = nextEnv;
  }
});
```
Self-recursion works today via a `Cell` placeholder bound into the
environment before the RHS is evaluated (`evaluateDefinition`,
`evaluator.ts:1568-1585`) — `closureEnv`/`callEnv` capture that `Cell` by
reference, and `evaluateVariable` unwraps it. Nothing about the loop changes
that; `tailInfo.env` still carries the same `Cell` entry, so re-looking-up
the recursive name inside the loop resolves correctly.

**Mutual recursion via `where` is out of scope — it doesn't work today,
independent of this change.** Original draft of this plan claimed two `fn`s
in a `where` clause close over each other via `Cell`s the same way top-level
self-recursive `=` bindings do. Wrong — checked against `evaluateWhere`
(`evaluator.ts:2698-2717`): it evaluates each definition's value and does a
plain `this.environment.set(def.name, value)`, with none of
`evaluateDefinition`'s `containsVariable`/`Cell`-placeholder logic. A
`where`-scoped function (even a *self*-recursive one, not just mutual) can't
see its own binding while its closure environment is being captured — this
is a pre-existing gap, not something this plan touches or silently fixes.
Trampolining only changes how already-working self-recursion (via top-level
`=`) avoids stack growth; it doesn't make `where`-scoped recursion start
working. If `where`-scoped recursive bindings are wanted, that's a separate
language-semantics change (a real "letrec" binding group), filed
separately if it comes up — not bundled here.

## Non-goals (explicitly out of scope, note in the doc/PR, don't implement)

- Tail calls through `|` (thrush) or `$` (dollar application), and the
  evaluated branch of `&&`/`||` — all real semantic tail positions, excluded
  to keep this a fixed, reviewable set of syntactic shapes (see Scope note
  at top). Same-shape follow-up if they turn out to matter in practice.
- Tail calls into native functions/HOFs (`reduce`, `list_map`, ...) — natives
  are already O(1) JS-stack via their own loops, not the problem this fixes.
- Cross-evaluator trampoline fusion — a local tail call into a closure owned
  by a different `Evaluator` (e.g. an imported function) always falls through
  to a normal `.fn(arg)` call rather than folding into the caller's loop, per
  the ownership check above. The call itself still works, and that foreign
  evaluator may trampoline internally for its own body — this is a boundary
  on *fusing loops across evaluators*, not a boundary on cross-module calls
  working at all.
- `where`-scoped recursive bindings (self *or* mutual) — don't work today,
  not touched here. See above.
- CPS rewrite / bytecode VM (options B/C from the earlier pitch) — separate,
  larger, not this task.

## Shared-logic refactor — retracted after measurement (review point D2)

Original plan (below, struck by measurement not by choice) was to extract
`if`/`match`/`where`/`application` dispatch logic into helpers called by
*both* the existing non-tail methods and the new tail-position dispatcher,
to stop the two from drifting apart. Attempted first, per guardrail 6 (add
characterization coverage, extract, run immediately, before adding
bouncing) — and guardrail 6 did exactly its job: the extraction broke a
real, previously-green test.

**What happened:** extracting `findMatchingCase` out of `evaluateMatch` (one
new method, `evaluateMatch` calling it) added exactly one JS stack frame to
every `match` evaluation — pure mechanical cost of an extra function call,
no behavior change. That was enough, on its own, to push
`test/features/std-json-module.test.ts`'s `'a long string value does not
overflow the stack'` test past the stack limit and fail it (confirmed by
reverting only that one extraction, with `application`/`if`/`where`
extractions still in place — failure went away; reverting only
`application` first did *not* fix it, isolating `match` specifically).
That json.noo test was already known borderline (its own comment: "flaky on
CI — smaller runner stack than local", and it's the exact test this whole
TCO effort traces back to). `evaluateApplication`'s consolidation carries
the identical mechanical cost (also +1 frame, via `applyArgToCallable`) on
an even hotter path (every application, not just every match) — it didn't
happen to trip this particular test, but there's no reason to trust it's
free elsewhere just because nothing currently visible caught it.

**Decision:** none of `evaluateIf`/`evaluateMatch`/`evaluateWhere`/
`evaluateApplication` are modified. All four stay byte-identical to their
pre-TCO form — zero added frame cost anywhere on the existing hot path.
`evaluateTailPosition` (below) is new, separate code. It re-implements the
small amount of dispatch logic each shape needs (branch selection, the
match-case-search loop, where-definition installation, one-argument
application) rather than sharing a call with the non-tail methods — real
but minor duplication, matching AGENTS.md's stated tradeoff ("minor
duplication beats a premature abstraction... don't pre-optimize into
something harder to maintain") now that the "premature" side of that
tradeoff has a measured cost, not just a hypothetical one. Genuinely shared,
already-existing primitives that don't add a call layer to the hot path —
`tryMatchPattern`, `withNewEnvironment` — are still called from both sides
directly, unchanged.

This does reopen the anti-drift concern D2 raised: if `evaluateIf`/
`evaluateMatch`/`evaluateWhere`/`evaluateApplication`'s semantics change
later without a matching update to `evaluateTailPosition`, they can drift.
Mitigation: a comment at each `evaluateTailPosition` case pointing at the
non-tail method it mirrors (file:line), so a future change to one is at
least discoverable from the other, even without a shared call forcing it.

## Prerequisite fix (discovered writing the test set, not part of the original design)

Writing the `where`/`typed`/`constrained` test cases surfaced a real,
pre-existing bug: `containsVariable` (`evaluator.ts:2720-2781`, used by
`evaluateDefinition` to decide whether a definition needs the `Cell`
self-recursion placeholder) has no case for `'where'`, and hardcodes `false`
for `'typed'` — both fall through without recursing into their sub-
expressions, so any self-recursive top-level `=` binding whose recursive
call is merely nested inside a `where` or a `: T` ascription anywhere in its
body silently loses recursion detection. Confirmed directly: `count = fn n
acc => (result where (result = if n == 0 then acc else count (n - 1) (acc +
1))); count 10 0` fails with `Undefined variable: count` — at depth 10, not
a stack issue, the closure simply never captured itself. This is broader
than the `where`-scoped-binding gap the architect flagged (that one's about
`evaluateWhere` never Cell-wrapping *its own* definitions; this one's about
top-level self-recursion breaking whenever the recursive call passes
*through* a `where`/`typed` node anywhere in the RHS, which blocked writing
valid tests for those two tail-position shapes at all — not a stack-depth
question, the calls fail regardless of depth).

Fixed by adding `'where'` (recurse into every definition's value and
`main`) and `'constrained'` cases, and changing `'typed'` from a hardcoded
`false` to recursing into `expr.expression` — mirroring the existing
`'match'`/`'pipeline'` pattern in the same switch. Verified: the `count`
example above now returns `10`; full suite unaffected (one pre-existing,
unrelated LSP hover test failure confirmed present on the base commit too,
via `git stash`).

This is a minimal, isolated correctness fix (bringing `containsVariable`'s
case coverage in line with a pattern already used elsewhere in the same
function) required to make the plan's own test list expressible — not a
scope expansion into TCO design. `where`-scoped recursive *bindings*
(the architect's original finding) remain unfixed and out of scope, per the
Non-goals section above.

Also corrected while writing tests: the `constrained`-expression test uses
`: a given a implements Eq` (a type *variable*), not `: Float given Float
implements Eq` as originally drafted — confirmed via the lexer directly
that concrete primitive type names (`Float`, `String`, ...) tokenize as
`KEYWORD`, not `IDENTIFIER`, and the `implements` constraint grammar
requires an identifier on its left side. Not a parser bug, just invalid
usage in the original draft.

## Files touched

- `src/evaluator/evaluator-utils.ts`: move `Environment` type here (from
  `evaluator.ts`), extend `FunctionValue` with optional `tailInfo` (including
  `owner`), extend `createFunction`'s existing single-argument signature to
  take an optional **second** argument, `tailInfo` (not third — `createFunction`
  currently takes only `fn`, `evaluator-utils.ts:119`).
- `src/evaluator/evaluator.ts`: import `Environment` from `evaluator-utils`
  instead of defining it; add `TailCall` type + `isTailCall` guard; add
  `evaluateTailPosition` as new, self-contained code (no changes to
  `evaluateIf`/`evaluateMatch`/`evaluateWhere`/`evaluateApplication` — see
  "Shared-logic refactor — retracted" above); rewrite the two
  body-evaluation call sites in `createCurriedFunction` to the loop above,
  attaching `tailInfo` (with `owner: self`) to the returned `FunctionValue`
  in both terminal branches. Also (already done, ahead of the rest — see
  Prerequisite fix above): `containsVariable`'s `'where'`/`'typed'`/
  `'constrained'` cases.

## Verification (TDD per AGENTS.md — test first, confirm red, then fix)

Guardrails from architect review before implementation — the goal is that
a failing test is diagnostic of *why*, not just "not green":

- **Not every new test is red-first.** The ownership test (below) exercises
  behavior that already works today (`.fn` resolves relative imports
  against the defining evaluator) — it must be green before this change
  *and* green after; its job is to catch a regression the trampoline could
  introduce, not to demonstrate a missing feature. Only the deep
  stack-safety tests are red-before/green-after. Label each test with which
  bucket it's in.
- **Every deep test has a shallow sibling**, run first: same program,
  small depth (e.g. 10), confirm green before touching the deep version.
  Confirms the deep failure is actually stack exhaustion and not a parse
  error, type error, undefined name, timeout, or wrong-value bug — all of
  which "look red" the same way a real TDD red does, and would make later
  "it's green now" a false signal if the red was never the right kind of
  red to begin with.
- **One expensive stress depth, not N of them.** Probe the actual overflow
  threshold once, in-process via the Bun test runner (not just the CLI —
  stack margins differ), with an explicit test timeout. Use that single
  large depth for the primary stress test; every structural variant (match/
  where/`;`/typed/constrained/cross-module/multi-arity) uses the *smallest*
  depth that reliably overflows today, not the stress depth — keeps the
  suite from paying a 200k-iteration cost per syntax shape.

1. Empirically confirm the current overflow threshold in-process (Bun test
   runner, not just CLI) — don't assume ~4000 or any other fixed number
   (one probe already hit 5000 successfully; varies by runtime/context).
   Record: one "stress" depth comfortably past it, one "smallest reliably
   overflowing" depth for cheap structural variants.
   **Measured** (`bun test v1.3.14`, in-process via `runCode`, `count = fn n
   acc => if n == 0 then acc else count (n - 1) (acc + 1)`): 10000 → OK,
   11000 through 15000 → `Maximum call stack size exceeded`. Threshold sits
   between 10000–11000. Initially used 12000 as the smallest-reliably-
   overflowing depth for structural variants; turned out flaky in practice
   (different tail-position shapes carry slightly different per-call frame
   overhead, and a ~1000-call margin wasn't enough — the `typed`-wrapper
   variant intermittently succeeded at 12000 across repeated runs). Raised
   to **25000**, confirmed stable across 5 repeated runs. **100000** as the
   stress depth (confirmed to fail fast today — 321ms — so it's cheap as a
   red test; must also stay fast once green).
2. Write the initial red/green test set in `test/features/` (new file,
   e.g. `tail-call-optimization.test.ts`), confirmed in the right state
   *before* any implementation:
   - **[red, stress depth]** Self-recursion via top-level `=`:
     `count = fn n acc => if n == 0 then acc else count (n - 1) (acc + 1)`.
     Shallow-depth sibling green first. Assert the correct return value.
   - **[red, smallest-overflow depth]** Same shape, tail call inside `match`
     (bound pattern variable used in the recursive call, not just `if`).
   - **[red, smallest-overflow depth]** Same shape, tail call as the final
     statement after a `;`.
   - **[red, smallest-overflow depth]** Same shape, tail call as the `main`
     expression of a local `where`.
   - **[red, smallest-overflow depth]** Same shape, wrapped in a redundant
     `: T` type ascription (`typed`).
   - **[red, smallest-overflow depth]** Same shape, wrapped in a
     `constrained` expression (real parseable syntax, `src/parser/
     parser.ts:1355`/`:2088`) — same transparent-passthrough as `typed`,
     tested separately as a distinct AST node kind.
   - **[red, smallest-overflow depth]** Two- and three-parameter curried
     self-recursive functions (not just arity 2) — confirms trampoline
     argument handling matches `evaluateApplication`'s currying/partial-
     application/`Cell`-unwrapping exactly (review point D3).
   - **[red, smallest-overflow depth]** Cross-module depth: a local
     function tail-calling a function imported from another `.noo` module —
     must not throw, correct result.
   - **[green before AND after — characterization, not feature]**
     Cross-module ownership-sensitivity: an imported function whose body
     depends on evaluator-local state, not just captured `env` — a function
     that performs a relative import of a sibling module when called.
     Correct behavior (today, and required to stay true after trampolining)
     resolves that relative import against the *defining* module's
     evaluator (`currentFileDir`, `evaluator.ts:145`); a bug that fused the
     bounce across evaluator ownership would resolve it against the
     caller's `currentFileDir` instead, importing the wrong file or failing
     to resolve. Run this test immediately after the shared-helper
     extraction (step 3 below) and again after the trampoline lands — it
     should never go red.
   - **[green before AND after — characterization]** Exact-once evaluation:
     a recursive argument or `;`-left expression that mutates a `Cell` via
     `mut`, asserting the final count after a shallow trampolined run.
     Catches duplicated or skipped evaluation of the condition/argument/`;`-
     left expression during bouncing. Keep shallow — this is about
     correctness of evaluation count, not stack depth.
   - **[green before AND after — characterization]** Environment
     restoration: after a deep trampolined call returns, evaluate an
     expression in the caller's scope and confirm caller bindings are
     intact and callee parameters/pattern bindings did not leak. Where
     practical (evaluator-level TS test, not just `.noo` source), also
     assert `environmentStack` is empty after the call succeeds. If
     practical, induce a runtime error inside a trampolined body and assert
     environment/stack restoration afterward — the `finally` in
     `withNewEnvironment` is part of the safety invariant, not incidental.
   - **[red, smallest-overflow depth]** Closure-environment switching: a
     same-evaluator tail call from one top-level function into a *different*
     closure that captures a distinct lexical value, recursing deeply, with
     the captured value asserted to affect the final result. Catches a
     trampoline bug that reuses the current call's environment instead of
     rebuilding from the target closure's own `tailInfo.env`.
   - **[green before AND after — characterization]** Existing application
     behavior: partial application and 1/2/3-parameter calls at shallow,
     non-recursive depth. This coverage paid off immediately (see below) —
     kept as regression coverage even though the extraction it was meant to
     bracket was retracted.
3. **Checkpoint 1 — attempted shared-helper extraction, retracted.** Tried
   extracting the four shared helpers per the original "Shared-logic
   refactor" design. Guardrail 6 worked exactly as intended: running the
   full suite immediately caught that extracting `findMatchingCase` alone
   (one new method, +1 JS frame per `match` evaluation, no behavior change)
   broke `test/features/std-json-module.test.ts`'s long-string stack-safety
   test — already a borderline case, tipped over by the added frame.
   Reverted all four extractions back to byte-identical originals; see
   "Shared-logic refactor — retracted" above for the full account and the
   revised design (evaluateTailPosition duplicates the small amount of
   dispatch logic instead of sharing a call with the hot path). Full suite
   confirmed clean on the revert (`git diff` reduced to exactly the
   `containsVariable` prerequisite fix). No trampoline code exists yet.
4. **Checkpoint 2 — metadata plumbing only.** Add `tailInfo`/`owner` to
   `FunctionValue`/`createFunction`, attach it at the two terminal-closure
   sites, but don't consume it yet (no `evaluateTailPosition`, no bounce).
   Re-run the same suite from checkpoint 1 — still all green, confirms the
   plumbing itself is inert until consumed.
5. **Checkpoint 3 — the trampoline.** Add `evaluateTailPosition` and the
   loop. Run the full step-2 test set: the red-labeled tests should now be
   green (stress + smallest-overflow depths), the characterization tests
   should still be green (never having gone red).
6. `AGENT=1 bun test` — full suite, confirm no regressions on ordinary
   non-recursive/non-tail calls.
7. `bun run typecheck`.
8. `node validate_examples.js` — doc examples still pass.
9. `bun src/cli.ts test stdlib.test.noo` and the existing
   `test/features/std-json-module.test.ts` long-string tests — confirm the
   `json.noo`/`parser.noo` combinator-heavy paths (which motivated this in
   the first place) still behave.
10. Manual spot-check: `NO_COLOR=1 bun src/cli.ts -e '<deep self-recursive
    call>'` to see the actual returned value, not just "test passed" (per
    AGENTS.md's hazard note about green-but-wrong — applies to eval
    correctness here, not just the typer, given how central this path is).
11. `git diff --check` (whitespace errors) and a manual read of the full
    diff before considering this done — confirm no accidental generated
    files or temp fixtures got swept in.

`|`/`$` staying non-tail-optimized is documented as a scope boundary in
Non-goals, not asserted as a test — deliberately inducing a host
`RangeError` to prove a negative is brittle and runtime-dependent. A future
`|`/`$` expansion gets a positive stack-safety test added at that time.

Not doing in this pass, flagged for later per the TCO doc's own "Status"
section: reverting `std/json.noo`'s `reduce`-based `json_string_body_p`
workaround back to the plain `many`-based combinator form to prove the fix
closes the loop that motivated it. Worth doing as a fast follow once this
lands, not bundled into the same PR (keeps this PR reviewable as "evaluator
change" vs "evaluator change + stdlib behavior change").
