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

## Proposed fix, 2026-08-01: packrat memoization design (design only — not implemented, pending owner sign-off)

Written up for review before any code is touched, per explicit instruction: this
project has a bad history with caching bugs, and a wrong memo key here would
silently corrupt an AST (not crash) for a library every parse depends on. This
section is the proposal; nothing below has been implemented.

### Step 0: is memoization even the right fix, or can the grammar just be pruned?

Checked first, since pruning is lower-risk than adding a caching layer if it
accounts for a meaningful share of the cost. `parsePrimary` (parser.ts:770) and
`parseSequenceTerm` (parser.ts:1943) already do O(1) first-token `switch`
dispatch and only fall back to `C.choice(...)` for genuinely ambiguous cases —
this optimization has already been done at the two biggest fan-out points. The
remaining 18 `choice`/`choice2`/`choice3` call sites in `parser.ts` are either
single-token operator alternatives (`+`/`-`, `*`//`%`, `|`/`|?` — O(1) per
alternative regardless of caching) or small 2-4-alternative dispatches for
patterns/destructuring/match-case terminators that need real lookahead to
disambiguate. None of this matches the profiling signature in the doc above —
the blowup was in `many`/`seq` call counts exploding under nested
`if`/`match`/`reduce` wrapping of expensive subtrees, not `choice` picking the
wrong alternative repeatedly. **Grammar pruning is exhausted at the sites that
would matter; packrat memoization is confirmed as the fix, not assumed.**

### Step 1: cache key — reuse `tokens.length`, skip the index-cursor rewrite

The doc above assumes the fix needs an index-based token cursor (changing
`Parser<T>`'s signature across ~150+ call sites) so positions are cheaply
hashable. That's avoidable. I spot-checked every `.slice()` site the doc
flagged (parser.ts:101, 110, 653, 841, 1707) plus `parseStatements`'s
`.filter()`/`skipSemicolons` preprocessing (parser.ts:2191) and
`combinators.ts`'s `token()`: every one produces a forward suffix of one
shared root `Token[]` per `parse()` call — nothing reorders, concatenates, or
synthesizes tokens outside that chain. Given that invariant, two `Token[]`
values with equal `.length` at any point during one `parse()` call are
guaranteed to be the *same* suffix (only one suffix of a given length exists
from a fixed root). **`tokens.length` is already a correct, O(1) position
key.** This means:

- No `Parser<T>` signature change.
- No call-site changes anywhere in `parser.ts` / `parse-type.ts`.
- All changes confined to `combinators.ts`.
- The separate O(n) `.slice(1)` cost (10.7B element copies in the profiled
  run) is real but independent — not required for memoization correctness,
  can be a follow-up.

**Pre-implementation checklist** (do before writing code, not after):
1. Full grep audit of every `.slice(`/`.filter(`/`.concat(`/array-literal
   construction of a `Token[]` that could reach a `Parser<T>` call — the
   spot-check above covered the sites the doc already named, not exhaustively
   every site in the codebase.
2. Confirm whether `bun test` reuses one process across test files (affects
   whether the reset-on-`parse()` boundary below is sufficient).
3. Confirm nothing calls internal production parsers (`parseStatements`,
   named `const` productions) directly, bypassing the public `parse()` entry
   point, anywhere in tests or tooling — that would bypass the reset.

### Step 2: what gets memoized

Wrap `choice`, `choice2`, `choice3`, `many`, `many1`, `sepBy`, and `lazy` —
the combinators that re-invoke child parsers as part of trying alternatives /
looping. Leave `token`, `map`, `seq`, `optional` unmemoized: they're
single-pass over their children, so memoizing the children already captures
the win, and adding cache overhead to something as cheap as `token()` risks
net loss while enlarging the change surface for no benefit.

```ts
const memoize = <T>(compute: Parser<T>): Parser<T> => {
  const cache = new Map<number, ParseResult<T>>();
  allCaches.push(cache); // registered for resetParserMemo(), see step 3
  return (tokens: Token[]) => {
    const key = tokens.length;
    const hit = cache.get(key);
    if (hit) return hit;
    const result = compute(tokens);
    cache.set(key, result);
    return result;
  };
};
```

Since `parser.ts`'s productions are module-level `const`s built once at
import time, each `C.choice(...)`/`C.many(...)` call site gets exactly one
long-lived closure with its own private cache — parser identity falls out for
free, no id-tagging registry needed. Parametrized producers like
`parseRecordFieldOrPositional(index)` build a fresh closure per call and so
get no cross-call reuse — same behavior as today, not a regression, just an
opportunity not captured.

### Step 3: cache lifetime — the actual correctness risk, made explicit

Because the memoized closures are built once at module load, their private
`Map`s persist for the *process's* lifetime, across every file the process
parses (CLI parsing multiple modules, or many snippets in one `bun test`
run). Keyed only by length, a second file whose remaining-token-count
coincides with a position from an earlier file's parse **will** get served a
wrong cached AST silently — this is the specific "wrong AST, not a crash"
failure mode to design against, not a hypothetical.

Mitigation:
- `combinators.ts` exports `resetParserMemo()`, iterating the module-level
  `allCaches` array populated by `memoize()` and calling `.clear()` on each.
- `parser.ts`'s single public entry point, `export const parse = (tokens:
  Token[]): Program => { ... }` (parser.ts:2212), calls `resetParserMemo()`
  as its first line, before `parseStatements(tokens)`. `parse-type.ts`
  imports the same `combinators.ts` module, so this one reset covers both
  grammars.

### Step 4: validation strategy (before this is considered done)

Correctness gates, in order, before any perf claim is trusted:

1. **AST-diff the existing corpus.** Snapshot `parse()`'s AST (JSON) for
   every `.noo` file already in the repo (`stdlib.noo`, `std/*.noo`, test
   fixtures, every literate doc block `validate_examples.js` walks) before
   the change; diff after. Any difference is a hard fail.
2. **Cross-file contamination test**, targeting the reset-boundary design
   specifically: hand-craft two snippets where a subexpression in file B
   lands at the same `tokens.length` as a *different* subexpression in file
   A, parse A then B in one process, assert B's AST is correct. This is the
   one bug class that only shows up with the reset boundary in place.
3. Full existing suite green: `AGENT=1 bun test`, `bun run typecheck`,
   `node validate_examples.js`. Necessary, not sufficient (per this repo's
   own standing hazard note: green proves "doesn't crash," not "AST is
   right").
4. **Perf re-measurement**, reported as evidence in the PR, not asserted as
   a CI gate (varies by machine): rerun `NO_COLOR=1 bun src/cli.ts
   --verbose std/json.noo`, confirm Parse phase drops toward `stdlib.noo`'s
   per-token ratio; re-instrument the same call counters used in the
   diagnosis above and confirm redundant re-derivation actually drops, not
   just wall clock; rerun the abandoned `std/parser.noo`-based rewrite of
   `std/json.noo` (still in git history) as the worst-case stress test —
   if packrat memoization is right, that 17x-plus regression should
   collapse back to reasonable, since it's the one case already proven to
   trigger the pathology hardest.

### Why this isn't a fundamental architectural ceiling

Packrat memoization isn't a speedup whose payoff depends on the grammar's
shape — for a PEG-style grammar (ordered choice + backtracking, which is what
`combinators.ts` implements), memoizing every production keyed by
`(production, position)` bounds total work to `O(productions × input
length)`: each production is computed at most once per position, full stop,
regardless of how much backtracking sits above it (Ford 2002, the original
packrat-parsing result). The doc's own numbers are consistent with this being
an implementation gap, not an architecture ceiling: `stdlib.noo`'s ~60
`token()` calls/input-token vs. `json.noo`'s ~20,450 is the *same* unmemoized
algorithm hitting the multiplicative case in one file and not the other, not
two different architectures. The one thing that would make this untrue is a
parser combinator whose behavior depends on something beyond `(production,
tokens)` — some hidden mutable state read at parse time — which would make
memoization unsound; audited `combinators.ts` and didn't find that (every
combinator is a pure function of its `tokens` argument). Memory is the only
residual concern, and it's not a real one at this scale: cache entries ≈
productions × file length ≈ 35 named productions × 2936 tokens ≈ 100K entries
for the worst case profiled so far.

## Implemented 2026-08-01: packrat memoization landed, with one design change from the plan above

Implemented on branch `packrat-parser-memoization` (worktree, based on
`origin/main`), confined entirely to `src/parser/combinators.ts` — no changes
to `parser.ts`, `parse-type.ts`, or any of the ~150+ production call sites, as
planned.

**One thing changed from the proposal: the cache key.** The plan above
proposed keying on `tokens.length` plus a manual `resetParserMemo()` call at
the top of `parser.ts`'s `parse()`. That was implemented first and broke: `bun
test` immediately surfaced 21 failures, all in
`src/parser/__tests__/parser-annotations.test.ts`, which calls
`parseTypeExpression` directly (bypassing `parse()`, and therefore its reset)
across many different type strings in one test file/process — exactly the
"does anything call production parsers directly, bypassing the entry point"
risk flagged as an unverified pre-implementation checklist item in the plan
above, now confirmed as a real bug, not a hypothetical. Unrelated type strings
parsed later in the file collided on remaining-token-count with cached
results from earlier ones and silently returned the wrong parse.

Fixed by keying on `tokens[0]` — the actual `Token` object reference at the
front of the remaining slice — in a `WeakMap<Token, ParseResult<T>>`, instead
of `tokens.length` in a `Map<number, ...>`. The lexer allocates a fresh
`Token` object per lexical token per `Lexer` run, so two `Token` objects are
only ever reference-equal if they're the literal same token from the same
lex; this makes cross-parse collision structurally impossible rather than
avoided-by-remembering-to-reset, and removes the manual
reset/invalidation-boundary problem entirely — no `resetParserMemo()` needed,
`WeakMap` entries are reclaimed by GC once a token stream is no longer
referenced. This is a strictly safer design than what was proposed (fewer
ways to get it wrong, no "did every entry point remember to reset" surface),
found only because the test suite caught the weaker version before it shipped
— which is the validation strategy working as intended, not a sign the
overall approach was wrong.

**Validation performed** (per the plan's step 4):
- AST-diff: `stdlib.noo` and `std/json.noo` (from the unmerged
  `worktree-agent-a0094a0f9c2c5500c` branch, used here only as a benchmark
  fixture) produce byte-identical `JSON.stringify(parse(tokens))` output
  before and after the change.
- Full suite: `AGENT=1 bun test` — 1349 pass / 8 skip / 0 fail, same
  pass+fail total (1357) as the pre-fix run, and the specific
  `parser-annotations.test.ts` failures are gone. Suite wall time also
  dropped sharply as a side effect (other large-file parses in the suite hit
  the same mechanism).
- `bun run typecheck` clean; `node validate_examples.js` exits 0.

**Performance result:** `std/json.noo` (2936 tokens) Parse phase, measured via
`NO_COLOR=1 bun src/cli.ts --verbose std/json.noo`:

| | Parse time |
|---|---|
| Before (baseline, this session) | 15,490.9ms |
| After | 28–67ms across repeated runs (typically ~30ms once JIT-warm) |

A ~230-500x reduction depending on run, landing at or under the ~50ms target
floated for this file. Output (`Type:` line) identical to baseline.

**Not done / left for follow-up, deliberately out of scope for this change:**
the secondary compounding factor from the diagnosis above (`tokens.slice(1)`
being O(remaining-length) per token, 10.7B element copies in the original
profiled run) — memoization caps the number of *redundant* calls, but each
individual `token()` call still pays a slice proportional to remaining
length. Not needed to hit the numbers above, so left alone rather than
bundled into a change that was already touching cache correctness.

**Status: implemented and validated on branch `packrat-parser-memoization`.
Not committed or opened as a PR — awaiting explicit go-ahead for that
separately.**
