# Parsing a large `.noo` file has a steep, non-obviously-localized cost

Filed 2026-08-01, found while building/reviewing `std/json.noo` (PR #165).
Not fixed here — this is a report for whoever picks up the parser
performance work next, not a resolved issue.

## Symptom

Typechecking `std/json.noo` (~575 lines) costs ~14-15s per process, almost
entirely in the **Parse** phase of noolang's own combinator parser (parsing
the `.noo` *source file*, not JSON text) — confirmed via `NO_COLOR=1 bun
src/cli.ts --verbose std/json.noo`'s phase breakdown (`Parse: ~14.5s` out of
~14.6s total; `Type` is ~70ms). This is a one-time cost per process — the
module cache (`src/module-loader.ts`) means it's paid once regardless of how
many times `std/json` is imported in the same run — but it's still large
enough to need `setDefaultTimeout(30000)` in
`test/features/std-json-module.test.ts` to avoid bun's 5000ms default
timing out the first test in that file.

This was originally ~30-43s before a round of refactoring (documented in PR
#165's history) that extracted the parser's single most deeply-nested
function (`parse_node`, a ~130-line match-of-matches) into several smaller
top-level leaf functions, cutting the cost roughly in half. That refactor's
success suggested a hypothesis: **cost scales with nesting depth within a
single function's body**, and shrinking the deepest function should keep
helping.

## That hypothesis is wrong, or at least badly incomplete

Applying the *exact same technique* to `parse_number` — the next-largest
single function, itself fairly deeply nested (nested `if`/`match`/`result_bind`
chains for the fraction and exponent grammar) — produced the opposite of
the expected result:

- Extracting `parse_number`'s three phases (leading integer, fraction,
  exponent) into three flat leaf functions (`scan_leading_int`,
  `scan_fraction`, `scan_exponent`), each individually shallow, and
  reducing `parse_number` itself to three chained `result_bind` calls with
  minimal nesting —
- took the whole file's parse time from **~14.8s to ~72.3s** (confirmed
  reproducible: reapplied and re-measured twice, both times ~72s, not
  noise).

The change was reverted (not shipped); `git log`/PR #165's diff history has
the before/after if someone wants to reproduce this exactly. The net
top-level-binding-count delta was small (+2: three new functions replacing
inline code), and the file got *shorter* overall (fewer total lines than
before, since the extracted functions were flatter than what they
replaced) — so "more top-level statements" and "more total lines" don't
explain a 5x regression either, on their own.

## What this rules out

- **Not nesting depth in isolation** — the same "extract to reduce nesting"
  move helped once (parse_node) and hurt badly once (parse_number).
- **Not raw line/character count** — the file got shorter and slower.
- **Not simply "more top-level bindings is worse"** — the successful
  `parse_node` extraction also added several new top-level bindings
  (`open_container`, `parse_object_key_and_colon`, `decide_separator`, two
  new `variant`s) and that made things *faster*.

## What's still unknown

No working theory yet for what specifically makes one extraction help and
a structurally-similar one hurt this badly. Candidates not yet
investigated (bounded effort spent here, did not chase further):

- Something specific to `parse_number`'s *particular* extraction shape —
  e.g. three sibling functions all taking `(Float, String)` and all calling
  `scan_digits`/`peek_char`, vs. `parse_node`'s extracted helpers, which
  have more varied signatures. Possibly a case where the parser combinator
  backtracks across *candidate productions that look similar to each
  other* specifically, not nesting depth per se.
- Something about where in the file the change lands — `parse_number`
  comes right after `scan_content` (also a large function); maybe
  cumulative/interacting cost between adjacent large-ish functions, not
  purely local to the one being changed.
- A genuine non-monotonicity in the underlying algorithm (e.g. exponential
  backtracking that's sensitive to exact choice-point count/order in ways
  that don't reduce to a simple size or depth metric).

## Where to look

`src/parser/` — this project's own combinator parser (`C.choice`,
`C.lazy`, etc., per `src/parser/combinators.ts` and `src/parser/parser.ts`).
No profiling was done inside the parser itself for this investigation (only
black-box timing via the CLI's `--verbose` phase breakdown and bisection by
truncating `std/json.noo` at statement boundaries) — an actual profile
(`--prof` / flamegraph on `bun src/cli.ts std/json.noo`) would likely
localize this far faster than further black-box bisection.

## Trigger for picking this up

Any stdlib file crossing a few hundred lines with realistic branching
structure is likely to hit multi-second-plus parse costs, and per this
report, "just refactor to reduce nesting" is not a reliable fix without
understanding the actual mechanism — it can make things much worse. Worth
picking up before the stdlib grows much further, or before another large
hand-written `.noo` module (`std/json.noo`-sized or bigger) is attempted.
