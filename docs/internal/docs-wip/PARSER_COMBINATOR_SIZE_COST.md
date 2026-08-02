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

## Update 2026-08-01: mechanism found and confirmed by profiling

Picked up per the "Where to look" pointer below. Instrumented
`src/parser/combinators.ts` with call counters on `token`, `seq`, `choice`,
`many`, `sepBy`, `lazy` (incrementing a plain counter object, no timing
tricks) and re-ran the exact repro. Numbers below are from that
instrumentation; the code was reverted afterward (diagnostic only, not
shipped).

**Headline data.** Parsing `std/json.noo` (2936 tokens) makes
**60,043,655** calls to `token()`, **46,296,700** to `seq()`, **19,662,475**
to `many()`, and copies **10,677,246,494** array elements total (every
`token()` success does `tokens.slice(1)`, an O(remaining-length) copy — see
"Compounding factor" below). That's ~20,450 `token()` calls per input
token. For comparison, `stdlib.noo` (1586 tokens, a same-order-of-magnitude
file with no reported perf issue) makes only ~60 `token()` calls per input
token — over 300x less. So this is not a generic property of file size —
it's specific to something in `std/json.noo`'s grammar shape.

**Bisection localizes it to one function.** Truncating `std/json.noo` at
successive line counts and re-measuring found the ratio jumps sharply
between line ~165 (fine: 6.6ms, 19K token calls for 579 tokens) and line
~220 (641ms, 6.14M token calls for 1154 tokens) — the span of exactly one
function, `scan_content` (lines 167-220), a `reduce`-based string-escape
scanner. Extracting *only* `scan_content` into its own file and parsing it
standalone reproduces the blowup almost exactly (578 tokens, 609ms, 6.12M
token calls) — confirming the cost is local to this one function, not an
interaction between it and neighboring large functions (ruling out the
"adjacent large functions" candidate from the original write-up).

**Narrowing inside `scan_content` found the actual trigger.** The function
has two `match ch (...)` blocks, each with ~10 arms whose values are record
literals `{@parts ..., @escaped ..., @closed_at ..., @error ..., @i ...}`.
Isolating just the first match block (300 tokens, 10 arms) still costs 73ms
/ 724K token calls — grossly disproportionate for 300 tokens on its own.
Building that match arm-by-arm (same real arm text, not synthetic) shows
the exact inflection: arms 1-6 (simple field values like `False`, `None`,
`(append parts ["\n"])`) cost ~19-22ms flat; arm 7 — the first arm whose
`@error` field is `(Some (JsonParseError {@message "...", @position (i -
1)}))`, a nested constructor application containing a record literal
containing an infix-arithmetic expression — jumps the cost to 36ms, and
each subsequent arm of that same complex shape adds roughly another
constant increment (49ms, then 62ms). A synthetic match with 10 structurally
uniform simple-value arms (built to test the original doc's
"similar-looking candidate productions" hypothesis directly) stayed
perfectly linear (2-10ms across 2-10 arms) — so **arm count and
superficial self-similarity between arms is not, by itself, the trigger**;
what matters is specific field values whose grammar is itself expensive to
parse (constructor application wrapping a record literal wrapping an infix
expression), repeated across multiple sibling `match` arms.

**Compounding factor: this cost multiplies with surrounding nesting, it
doesn't just add.** The `token()`-calls-per-input-token ratio climbs at
every level of enclosing context for the exact same underlying match
arms: ~2,400/token isolated as a bare top-level match, ~6,600/token once
embedded in the real `step` lambda (adds an outer `if`/`if` wrapper),
~10,600/token for the full `scan_content` function (adds the `reduce` call
and the trailing `match (final | @error) (...)` that consumes its result),
and ~20,450/token in the full file. Each additional layer of enclosing
`choice`/`many`/`seq` structure doesn't add a fixed cost on top of the
expensive subtree — it re-triggers full re-parses of it. That's the
mechanism: **`src/parser/combinators.ts` has no memoization.** `choice`,
`many`, and `sepBy` are ordinary backtracking combinators — when an
enclosing choice point fails (or a `many`/`sepBy` loop probes one iteration
too far and has to stop) after having descended through an expensive
subtree, that subtree gets re-parsed from scratch on the next attempt, with
zero reuse of prior work (no packrat cache keyed by parser+position exists
anywhere in the combinator library). The number of times a given subtree
gets re-parsed is governed by how many backtracking choice-points end up
stacked above it in the final grammar shape — which correlates only
loosely with visual nesting depth or line count, and is essentially
impossible to predict without profiling, because it's a *global*,
multiplicative property of the surrounding grammar, not a *local* property
of the function being edited.

This fully explains the original non-monotonicity finding: extracting
`parse_node` happened to remove a layer of backtracking retries above its
body (2x win); extracting `parse_number`'s three phases into flat
`result_bind`-chained leaf functions happened to place the same kind of
expensive-to-parse subtrees under *more* enclosing backtracking retries
than the original nested form had (5x loss). Both are the same mechanism;
the direction of the effect depends on details of the resulting grammar
shape that aren't visible from reading the `.noo` source, only from
profiling the parse.

**Compounding factor, secondary:** every successful `token()` call does
`tokens.slice(1)` (also true of the handful of direct `.slice()` calls in
`src/parser/parser.ts`, e.g. lines 101, 110, 653, 841, 1707, 2191) — an
O(remaining-token-count) array copy per token consumed, not O(1). This
doesn't cause the multiplicative blowup by itself (`stdlib.noo` pays the
same per-token slice cost and is fast), but it multiplies the cost of
every one of the 60M redundant `token()` calls above, and the measured
10.7 billion total element copies is itself a large fraction of the
observed wall-clock time.

**Why this isn't fixed here.** The correct fix is packrat-style
memoization: cache each parser's result keyed by (parser identity, token
position), so a choice point that's already explored a subtree doesn't
re-explore it. Doing that properly also wants switching the token stream
representation from `Token[]` array-slicing to an index-based cursor (both
to make positions cheaply hashable for the memo key, and to eliminate the
O(n) slice-copy cost noted above). That means changing the `Parser<T>`
signature (`(tokens: Token[]) => ParseResult<T>`) itself, which is used at
every one of the ~150+ parser definitions across `src/parser/parser.ts`
(2231 lines) and `src/parser/combinators.ts`, plus giving every parser a
stable identity for the memo key (anonymous closures built via `C.map`,
`C.choice`, `C.lazy` etc. would all need one). This is exactly the
"restructuring the combinator library itself" scenario — high blast radius
across a shared library every noolang program's parse depends on, and not
attempted here per instructions to prefer a correct diagnosis over a risky
rewrite. Whoever picks this up next has a concrete, verified target
(add a memo cache to `choice`/`many`/`sepBy`/`lazy` keyed by token position
+ parser identity) rather than a mystery to re-diagnose.

## Where to look (superseded above, kept for the reproduction recipe)

`src/parser/` — this project's own combinator parser (`C.choice`,
`C.lazy`, etc., per `src/parser/combinators.ts` and `src/parser/parser.ts`).
The original version of this doc noted no profiling had been done; that's
now done (see above). To reproduce: add counters to `token`/`seq`/`choice`/
`many`/`sepBy` in `combinators.ts`, parse `std/json.noo`, and compare
against `stdlib.noo` as a same-size, non-pathological baseline.

## Update 2026-08-01: combinator-style rewrite makes it worse, not better

Tested directly, per the earlier "worth revisiting" note: rewrote
`std/json.noo`'s parser on top of a new `std/parser.noo` generic
parser-combinator library (`choice`/`many`/`sep_by`/`between`/`pbind`/etc. —
see that module) instead of the original's hand-rolled index-threading, on
the hypothesis that many small composed combinator calls might not trigger
the same backtracking blowup as the large hand-rolled `match`/`if` trees
implicated above. That hypothesis is **refuted**, not confirmed.

Measured directly (`NO_COLOR=1 bun src/cli.ts --types-file std/json.noo`,
wall clock via `time`): the combinator-based rewrite did not finish
typechecking before being killed at **4m25s** (259s user / 15s system CPU,
103% cpu — genuinely working the whole time, not hung) as unreasonable to
wait further; the original hand-rolled version's own baseline, from the
top of this doc, is ~14-15s total, ~14.5s of which is Parse. That's a
regression of 17x-plus (a lower bound — the run was killed still in
progress, not at a natural end), not an improvement, for a same-size
document.

This is consistent with — not contradictory to — the mechanism diagnosed
above. A parser-combinator library is, structurally, *more* backtracking
choice-points per line than hand-rolled `if`/`match` code, not fewer:
`choice`, `optional`, `many`, and `sep_by` each compile down to noolang
source containing more nested function applications and `match`
expressions than the equivalent hand-written branch, and every one of
those is itself parsed by noolang's own unmemoized `src/parser/
combinators.ts` (the thing actually being measured here — this is a cost
of parsing the `.noo` *source file*, same as everywhere else in this doc,
not a JSON-parsing runtime cost). More combinator calls means more
`choice`/`many`-shaped source constructs for noolang's own parser to
backtrack over, which by the mechanism above multiplies rather than adds.
Writing idiomatic combinator code made the problem this doc is about
*worse* by construction, not better.

Also encountered during the same rewrite attempt (typer side, not parser
side, but relevant context for anyone picking this up): folding several
grammar productions into one large self-recursive top-level binding (to
route around a separate, still-unfiled-precisely typer bug — see the
rewrite's abandoned draft in git history if resurrected) made this same
symptom far worse still (multiple *minutes*, not ~106s) — direct evidence
that source-level nesting depth within a single top-level binding, not
just aggregate choice-point count across a file, is part of what's being
multiplied. Splitting the same logic back into several modestly-sized
top-level bindings (still combinator-based) didn't fix the underlying 106s+
regression but kept it from being categorically worse.

**Practical conclusion:** `std/json.noo` was NOT switched over to
`std/parser.noo` as a result of this — the original hand-rolled version
(PR #165) stays faster by a wide margin and is what's shipped. `std/
parser.noo` itself still landed (see its own PR) as a reusable library on
its own merits, and as a real answer to "can noolang express combinator-
style parsing at all" (yes, cleanly) — but it should not be reached for on
a document this size until the fix below actually lands. This raises the
priority of packrat memoization, not lowers it: the natural stdlib
migration path (hand-rolled parsers → shared combinator library) actively
makes today's problem worse until memoization exists.

## Trigger for picking this up

Any stdlib file crossing a few hundred lines with realistic branching
structure is likely to hit multi-second-plus parse costs *if* it contains
`match`/record-literal-heavy constructs shaped like `scan_content` above
(multiple sibling arms whose values are nested constructor-application +
record-literal + infix-expression trees). Per this report, "just refactor
to reduce nesting" is not a reliable fix without understanding the actual
mechanism — it can make things much worse, because the cost is governed by
backtracking-retry depth in the surrounding grammar, not by the visible
shape of the function being edited. The real fix (packrat memoization in
`src/parser/combinators.ts`) is worth picking up before the stdlib grows
much further, or before another large hand-written `.noo` module
(`std/json.noo`-sized or bigger) is attempted.
