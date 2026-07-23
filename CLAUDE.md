# Noolang — working notes for Claude

Noolang is a functional, expression-based, LLM-friendly language implemented as
a TypeScript interpreter (lexer → parser → typer → tree-walking evaluator).

## Toolchain

- Runtime/tests use **bun**, not npm.
- Run tests: `AGENT=1 bun test` (`AGENT=1` keeps output non-interactive).
- Typecheck: `bun run typecheck`. Doc examples: `node validate_examples.js` (must exit 0).
- Quick probes: `bun src/cli.ts -e "<expr>"`, `--types "<expr>"` for inferred types,
  `bun src/cli.ts file.noo` for a file. Prefix `NO_COLOR=1` to strip ANSI.
- `gh` lives at `/opt/homebrew/bin`; `export PATH="/opt/homebrew/bin:$PATH"` first.

## Hazard: type-inference work goes green and wrong at the same time

The suite proves inference doesn't *crash*, not that the inferred type is *right* —
several passing-but-wrong inferences have shipped and been caught by hand. When
touching the typer, verify with `NO_COLOR=1 bun src/cli.ts --types '<expr>'`, never a
green suite alone. Prefer incomplete over incorrect: a too-general `List a` is fine, a
confidently wrong concrete type is not.

## Tests

`test/utils.ts` has the helpers — start from `runCode` / `parseAndType` /
`expectSuccess` / `expectError`, and read the file for the assert zoo. Do NOT hand-roll
`new Lexer(...) → parse → typeAndDecorate → new Evaluator`; the helpers keep tests
alive across pipeline changes. Bool is a variant (`"True"` / `"False"`), not a
primitive.

TDD: write the failing test first, confirm it's red, then fix.

`stdlib.test.noo` (run via `noo test`, not `bun test`) is a narrow complement,
not an alternative: it exercises `stdlib.noo` as an imported module, the way a
real program does, and it's the only thing that also validates `std/test`
itself end to end. It caught a bug (module-destructure arity corrupting
unrelated inference) that isolated TS snippets didn't reproduce. It cannot
assert on inferred types or error messages (`Expectation` only wraps runtime
Pass/Fail), and every test in the file shares one type-inference pass, so it's
more fragile than TS's per-test isolation. Default to TS; add here only for
"does stdlib work as consumed."

## Language quick facts

- ADTs use `variant Name = A | B`; `type` is for aliases (`type Point = {Float, Float}`).
- Unit is `{}` (not `()`). Records `{@field val}`, tuples `{a, b}`, lists `[a, b]`.
- `/` and `%` return `Option Float` (safe division).
- Record patterns in `match` and destructuring bindings (`{@a} = r`) bind a *subset* of
  fields; naming a field the record lacks is a type error.
- A `match` on a concrete variant must cover every constructor or include a catch-all
  (`_` or a bare variable); non-exhaustive matches are a type error.
- `<` `>` `<=` `>=` are polymorphic via `Ord` (Float, String); `equals` / `==` via `Eq`
  (Float, String, Bool, Option, Result, List).
- Effects (`!write`, `!read`, `!log`, `!ffi`, …) are inferred and tracked in function
  types; annotations may over-declare but must not omit a performed effect.
- Module system: a `.noo` file's last expression is its exported value. See
  `docs/language-reference.md` §Import System.
- A trait impl for a primitive touches three sites — the type in
  `src/typer/builtins.ts`, the native in `src/evaluator/evaluator.ts`, and
  `implement <Trait> <Type> (...)` in `stdlib.noo`. Mirror the existing `Eq Float` /
  `Add String` wiring rather than inventing a shape.

## Docs

- `docs/*.md` are validated as whole (concatenated) literate programs; `README.md` is
  validated **per-block** (each ```noolang block runs standalone). See
  `validate_examples.js`.
- Planning docs live in `docs-wip/`.

## Code style

Functional: pure functions over classes, composition over inheritance, small functions
over large nested ones. Keep nondeterminism (`Math.random`, `Date.now`) out of pure
functions — pass it in, so the thing stays testable. If a test is hard to write, treat
that as a design signal and propose a refactor.

Code must not lie: names, types, and structure reflect what the code actually does.
Express intent by decomposition, not comments or procedural narration — extract a
concept rather than introduce a procedural intermediate. Pipelines read linearly in
source order. Push correctness into the type layer; make illegal states unrepresentable
where practical.

Minor duplication beats a premature abstraction, and YAGNI wins ties. Don't
pre-optimize into something that's harder to maintain.

## Prompting

1. Prompt is *for* an agent. Write for and understand intended agent's knowledge and capability and *trust* them appropriately.

2. Good prompts include *justification*. Agents without reason comply thoughtlessly. Thoughtful agent desirable.

3. Sound justifications *falsifiable*. Reason aligns agent to goal. Prevents misapplication. Agent assesses instruction against justification *within context* and can push back or pivot. False guidance can be tested and cleaned up. Unfalsifiable guidance accretes waste.

4. Good instructions are *minimum* description of intent/values/boundaries/hazards/outcome. Alignment more important than precision. Excess description limits autonomy for no benefit. Every word tell.

5. Self-apply these rules before delivering/executing prompt. Reflection aids alignment. Catches laziness.  
