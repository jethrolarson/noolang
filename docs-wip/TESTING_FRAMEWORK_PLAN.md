# Testing Framework Plan

A test framework for programs written *in* noolang. (The `test/` directory tests the
interpreter itself, in TypeScript; noolang programs currently have no way to verify
themselves.)

## Design principles

**Shipped with the language, built as userland.** The framework is distributed
with the interpreter (one blessed framework — Rust/Go lesson — beats ecosystem
fragmentation before an ecosystem exists), but it is a plain `.noo` library
using only public language features. No evaluator hooks, no typer access, no
special resolution beyond a default import-map entry (or `std/test` as sugar
over one). This is deliberate: the framework is a forcing function proving
noolang is useful in userland. Anything it needs and cannot do publicly is,
by definition, a language gap to fix — not a privilege to grant. A userland
competitor must be buildable on equal footing.

**Tests are values.** Noolang's module system — a file's last expression is its
export — is already the right shape for a test framework. A test file's last
expression is a `Test` value; the runner imports it and walks the tree. No
registration side effects, no global state, no discovery-by-reflection.

This is the lesson from Tasty (Haskell), Expecto (F#), and elm-test, and the
anti-lesson from mocha/pytest: side-effect registration prevents composing or
manipulating suites as ordinary data. When tests are values, features other
frameworks must build in — parameterized tests, filtering, sharding — are just
`list_map` and `filter` over the tree.

**The language does the lifting, so the framework stays small.**

- No lifecycle hooks (`beforeEach`, fixtures). Those exist to reset shared mutable
  state; noolang has none. Setup is a function you call in the test body.
- No assertion zoo. Traits replace it: one `expect_eq` constrained by `Eq` + `Show`
  covers what JUnit needs forty asserts for, and `Show` gives automatic
  expected/actual failure messages — the value Clojure gets from the `is` macro,
  without macros.
- No special parameterized-test feature. Table-driven tests are
  `group "cases" (list_map make_case table)`.

## Core types

```
variant Expectation =
    Pass
  | Fail {@message String, @expected Option String, @actual Option String};

variant Test =
    Case String ({} -> Expectation)
  | Group String (List Test);
```

Users touch helpers only (`test_case`, `group`, `expect_*`, `fail`);
constructors are documented as internal. This is social opacity — the language
cannot hide constructors (no way to export a type without them; noted as a
language observation, not a blocker), so convention has to carry what elm-test
enforces with an opaque type. It matters because payloads will evolve
(`Skip`/`Todo` constructors, `Fuzz` later), and helper-only call sites keep
that evolution from breaking every test file.

`Fail` carries a structured payload from day one. Prior art is unambiguous:
JUnit shipped string-only failures and IDEs parsed message strings for diff
windows for years until opentest4j restructured it; HUnit and Rust's
`assert_eq!` have the same re-parse-the-string tooling scar. elm-test did it
right — structured `reason` consumed directly by console/JSON/JUnit reporters —
but got away with *evolving* the payload only because `Expectation` is opaque,
and noolang's opacity is social only. Structured now: `expect_eq` fills all
three fields via `show`; `fail "msg"` fills message with `None` for the rest.

Why a dedicated `Expectation` rather than reusing `Result {} String`:

1. **Assertion-free tests become type errors.** If the body type were
   `{} -> Result {} String`, any operation already returning that type would
   typecheck as a complete test asserting nothing (`fn _ => save config`).
   A distinct type forces every body to terminate in an explicit `expect_*`.
2. **Constructor room.** The structured `Fail` above already exercises it, and
   `Skip`/`Todo` are known growth from prior art. `Result`'s constructors are
   frozen; retrofitting means stuffing conventions into the `Err` payload.
3. **Cost is near zero.** Verdicts don't compose monadically; aggregation is one
   function (`expect_all`). Reusing `Result` buys combinators nobody would call.

Why thunked bodies (`{} -> Expectation`, not eager `Expectation`):

- Suite construction never crashes; the runner controls execution and timing.
- Effects land on that arrow, inferred and visible in the type — which at
  minimum documents each test's effect footprint, and leaves the door open to
  effect-aware running (see Open questions; the no-privilege principle
  constrains how a runner could read them).
- Spike result (2026-07-16): mixed-effect thunks in a `List Test` "unify" only
  because constructor application silently drops effects — an effectful thunk
  passes into a pure-typed payload with no error, though a direct annotation
  correctly rejects the same omission. Typer bug, filed to fix pre-framework.
  Once fixed, `Case`'s payload must declare an effect row broad enough for
  effectful tests (over-declaring is legal); whether variant declarations
  support effect-*polymorphic* payloads is an open sub-question.

## Assertion API

```
expect_eq  : a -> a -> Expectation given a is Eq, a is Show   # expected first
expect_neq : a -> a -> Expectation given a is Eq, a is Show
expect     : String -> Bool -> Expectation   # labeled boolean check — label is
                                             # mandatory so failures aren't mute
expect_ok  : Result a e -> Expectation given e is Show
expect_err : Result a e -> Expectation given a is Show
expect_all : List Expectation -> Expectation # first Fail wins
fail       : String -> Expectation
```

Deliberately small. Anything else composes from these plus ordinary functions.
`expect_eq` is expected-first: partial application (`expect_eq 4`) and pipeline
use (`add 2 2 | expect_eq 4`) both come out right.

## Where it lives

Not globals in `stdlib.noo` — test vocabulary has no business in every
program's namespace — and not a privileged `std` component. A plain `.noo`
library shipped with the install, resolved through the ordinary import
mechanism: a default import-map entry, or minimal `std/test` routing that is
nothing more than sugar for one. (The module loader's current `std/*` "deferred"
error conflates routing with splitting the monolithic stdlib; only the routing
is needed here, and it stays unprivileged.)

```
{@test_case, @group, @expect_eq} = import "std/test";
```

Spike result (2026-07-16): variants survive import — constructors export as
record fields, application works, `match` on imported constructors works, and
exhaustiveness checking sees the full constructor set across the module
boundary (missing case correctly rejected). No module-system blocker.

Adjacent finding from the same spike: an entry file's relative imports resolve
against the CWD, not the file's directory, contradicting the language
reference. Filed to fix pre-framework — the runner's generated entry module
depends on this behaving as documented.

## Test file convention

`*.test.noo`, colocated with the code (Rust convention: zero config, discovery by
filename). The file's last expression must have type `Test` — the runner
type-checks the export, so a malformed test file is a compile error, not a
runtime shrug.

```
# math.test.noo
{@test_case, @group, @expect_eq} = import "std/test";
{@add} = import "./math";

group "math" [
  test_case "adds" (fn _ => expect_eq 4 (add 2 2)),
  test_case "identity" (fn _ => expect_eq 7 (add 0 7)),
  group "edge cases" [
    test_case "negatives" (fn _ => expect_eq 0 (add 1 (-1)))
  ]
]
```

## Runner: self-hosted in noolang

The runner is written in noolang, deliberately — the same forcing function as
the no-privilege principle: every capability it needs and lacks is a gap worth
filling for general-purpose programs anyway.

What exists today and suffices:

- discovery: `exec "find" [...]` (or a future `list_dir`)
- reading/writing: `readFile` / `writeFile`
- reporting: `print` / `println`

Two seams the language forces, both surfaced rather than hidden:

1. **Static imports ⇒ generated entry module.** `import` takes a literal
   specifier; a runner cannot import paths discovered at runtime. Same
   constraint elm-test has, same solution: generate an entry module that
   imports every discovered suite into a list, then evaluate it.

   ```
   # generated .noo-test-entry.noo
   {@run_all} = import "std/test";
   t1 = import "./src/math.test";
   t2 = import "./src/parser.test";
   run_all [{@path "src/math.test.noo", @suite t1},
            {@path "src/parser.test.noo", @suite t2}]
   ```

   The generation itself is noolang (`exec` for discovery, string building,
   `writeFile`), then `exec` runs the entry file.

2. **Process exit code.** Add an `exit` builtin (`exit : Float -> {}` with an
   effect). Decided over a CLI-shim mapping: the shim would be runner
   privilege; the builtin is a public capability any program needs.

All test-running logic — tree walk, thunk execution, aggregation, formatting —
lives in noolang (`run_all` and friends), importable and testable like any other
module. The framework's own tests are written in itself.

### Isolation

No general `try` builtin — it would weaken the errors-are-values story, and
typechecking already eliminates most crash classes (non-exhaustive matches,
division, null). The runner isolates per *file* via the exec seam: one crashed
or hung suite reports as a failed suite, remaining files run. The process
boundary also buys timeouts and interpreter-crash containment. No per-case
isolation machinery.

The residue that typechecks and still dies at runtime — `unwrap`, `Unknown`
escapes, nontermination, interpreter bugs — is what per-file isolation is for.
Two of the original residue classes were stdlib bugs, fixed up front (below).

## Pre-framework findings (fix up front)

Auditing the isolation question surfaced two stdlib safety gaps, both standalone
PRs to land before the framework:

1. **`readFile`/`writeFile` throw instead of returning `Result`.** Types claim
   the operations can't fail; a missing file kills the program. Fix:
   `readFile : String -> Result String ReadError !read` with a real `ReadError`
   variant (`FileNotFound` / `ReadPermissionDenied` / `ReadFailed`), sibling
   `WriteError`. With IO safe, ordinary effectful tests stop being crash risks.
2. **`ExecError` is a phantom.** `exec`'s error type is an unconstrained
   quantified type variable, not a real type — matches against the `Err`
   payload typecheck at *any* type. Define the variant honestly.

## Output

Deterministic, greppable, machine-readable-ish — LLM-friendliness is a stated
language goal. Failures show the group path, the case name, and expected/actual
via `show`. Respect `NO_COLOR`. Exit code = failure count (capped).

```
math
  ✓ adds
  ✗ identity
      expected: 7
      actual:   8
  edge cases
    ✓ negatives

2 passed, 1 failed
```

## Property testing: reserved, not built

elm-test proved integrated fuzz beats a bolted-on second framework (Haskell's
HUnit/QuickCheck/Hedgehog fragmentation is the cautionary tale). But generators,
seed plumbing, and shrinking are their own project. v1 ships `Case`/`Group`
only; the tree shape leaves room for a `Fuzz` constructor later, walked by the
same runner. When it comes: deterministic seeds reported on failure
(`noo test --seed N` to reproduce) — `random`/`randomRange` builtins exist but
are unseeded, so a pure seeded PRNG is part of that later work.

## Implementation phases (TDD throughout)

0. ~~Pre-framework fixes~~ — done. Safe IO (#135, merged), honest `ExecError` +
   exec arg passing (#136, merged), CWD-relative entry-file imports (#137,
   merged), constructor-payload effect enforcement (#138), cross-module
   constructor→variant dispatch merge (#139). #135 also uncovered and fixed
   runtime trait dispatch resolving by constructor name — every user-defined
   variant's trait impl was silently broken.
1. ~~Spikes~~ — done 2026-07-16. ADT-through-modules: passes. Effect
   unification: revealed the laundering bug fixed in #138.
2. ~~`std/test` routing + module~~ — done (#141). Routing is resolution sugar
   over the ordinary module path; the module is plain userland noolang.
   `exit : Float -> {} !ffi` builtin shipped separately (#140).
3. **`run_all` in noolang** (next): tree walk, thunk execution, aggregation,
   report formatting. Pure core (tree + results → report string), effectful
   shell (print). The framework tests itself from here on.
4. **Discovery + entry generation** in noolang; `noo test` subcommand as a
   thin trigger; per-file exec isolation.

## Open questions

- **Effect-aware running** (label tests pure/`!write`/`!ffi`; a `--pure` flag).
  Wants typer access userland doesn't have, and the no-privilege principle says
  the runner doesn't get to cheat. Either the language grows a public
  introspection mechanism, the runner does it unprivileged (`exec` the CLI's
  `--types` and parse), or it's cut. Not load-bearing for v1.
- ~~`Fail` record ergonomics probe~~ — resolved during phase 2: nested
  record-constructor patterns work well
  (`Fail {@expected Some e, @actual Some a} => …`).
- **Constraint display**: `expect_eq` shows as `a -> a -> Expectation` with no
  visible `Eq`/`Show` constraints — too-general display, not incorrect.
  Pre-existing typer behavior worth a look eventually.
