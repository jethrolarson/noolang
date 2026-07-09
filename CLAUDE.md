# Noolang — working notes for Claude

Noolang is a functional, expression-based, LLM-friendly language implemented as
a TypeScript interpreter (lexer → parser → typer → tree-walking evaluator).

## Toolchain

- Runtime/tests use **bun**, not npm.
- Run tests: `AGENT=1 bun test` (the `AGENT=1` keeps output non-interactive).
- Typecheck: `bun run typecheck` (`tsc --noEmit`).
- Doc examples: `node validate_examples.js` (must exit 0).
- Quick probes: `bun src/cli.ts -e "<expr>"`, or `--types "<expr>"` for inferred
  types. Prefix `NO_COLOR=1` to strip ANSI. Run a file: `bun src/cli.ts file.noo`.
- `gh` lives at `/opt/homebrew/bin`; add it to PATH before use:
  `export PATH="/opt/homebrew/bin:$PATH"`.

## Writing tests — use the shared helpers

Do NOT hand-roll `new Lexer(...) → parse → typeAndDecorate → new Evaluator → …`.
`test/utils.ts` exports higher-level helpers:

- `parseAndType(code)` → runs lexer + parser + `typeAndDecorate`.
- `runCode(code)` → `{ evalResult, typeResult, finalType, finalValue }` (types
  AND evaluates; `finalType` is the type string, `finalValue` the value).
- `expectSuccess(code, expectedValue?)` — asserts it evaluates (optionally to a
  value).
- `expectError(code, /pattern/)` — asserts type-check/eval throws matching the
  pattern.
- Value asserts: `assertNumberValue` / `assertStringValue` / `assertListValue` /
  `assertConstructorValue` (Bool is a variant: name `"True"` / `"False"`).
- For type strings: `typeToString(result.type, result.state.substitution)` from
  `src/typer/helpers.ts`.

Follow TDD: write the failing test first and confirm it's red before the fix.

## Adding a trait implementation (pattern)

To implement a trait for a primitive type (e.g. `Eq`/`Ord` for String), mirror
the existing `Eq Float`/`Add String` wiring:

1. `src/typer/builtins.ts` — register the primitive's TYPE
   (`createBinaryFunctionType(...)`). Operator types that dispatch on a trait
   carry the constraint, e.g. `type.constraints = [implementsConstraint('a', 'Ord')]`.
2. `src/evaluator/evaluator.ts` — register the native implementation next to the
   sibling primitives (`primitive_*`), using `isString`/`isNumber`/`createBool`/
   `createNativeFunction`.
3. `stdlib.noo` — `implement <Trait> <Type> ( <fn> = <primitive> );`. Conditional
   impls use `given a implements <Trait>` (multi-constraint uses `and`).

## Language quick facts

- ADTs use `variant Name = A | B`; `type` is for aliases (`type Point = {Float, Float}`).
- Unit is `{}` (not `()`). Records `{@field val}`, tuples `{a, b}`, lists `[a, b]`.
- `/` and `%` return `Option Float` (safe division).
- Record patterns in `match` bind a *subset* of fields; destructuring bindings
  (`{@a} = r`) currently require an *exact* match. There is no variant
  exhaustiveness checking yet (non-exhaustive `match` is accepted).
- Effects are tracked in function types (`!write`, `!read`, `!log`, `!ffi`, …);
  annotations may over-declare but must not omit an effect the body performs.

## Docs & CI

- `docs/*.md` are validated as whole (concatenated) literate programs; `README.md`
  is validated **per-block** (each ```noolang block runs independently — it's a
  collection of standalone snippets). See `validate_examples.js`.
- Planning docs live in `docs-wip/`.
