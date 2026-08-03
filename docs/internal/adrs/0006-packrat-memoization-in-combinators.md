# 6. Parser combinators memoize by token identity, not position index

Date: 2026-08-01

## Status

Accepted, implemented (`src/parser/combinators.ts`)

## Context

Parsing a large `.noo` file (`std/json.noo`, 2936 tokens) cost ~15s, almost
entirely in noolang's own source-file Parse phase — not runtime JSON
parsing. `stdlib.noo`, a same-order-of-magnitude file, cost ~60 `token()`
calls per input token; `std/json.noo` cost ~20,450 — over 300x more.
Root cause, confirmed by instrumentation: `choice`/`many`/`sepBy` in
`combinators.ts` have no memoization. Every backtrack re-parses an already-
parsed subtree from scratch, and the cost *multiplies* (not adds) with each
enclosing layer of backtracking structure — a global property of how many
choice-points end up stacked above a subtree in the final grammar shape, not
a local property of the function being edited.

This produced two false starts before the mechanism was understood.
Extracting the parser's most deeply-nested function into flat leaf
functions cut cost in half (fewer backtracking retries above the body, by
accident); applying the identical technique to the next-largest function
made it 5x worse (the extraction placed the same expensive subtrees under
*more* enclosing retries). A later combinator-style rewrite of the same
parser, hypothesized to have fewer expensive subtrees, instead made it 17x+
worse (killed at 4m25s+) — combinator style is structurally *more*
backtracking choice-points per line than hand-rolled `if`/`match`, not
fewer. All three results are the same mechanism; the direction depended on
grammar-shape details invisible from reading source, only visible from
profiling.

Grammar pruning (first-token dispatch instead of `choice`) was checked and
found already exhausted at the two sites big enough to matter
(`parsePrimary`, `parseSequenceTerm`); the remaining `choice` sites don't
match the profiling signature. Packrat memoization — cache each parser's
result keyed by `(production, position)` — was confirmed as the fix, not
assumed: for a PEG grammar this bounds total work to
`O(productions × input length)` by construction, each production computed
at most once per position, regardless of backtracking depth above it
(Ford 2002). The only thing that would make this unsound is a combinator
depending on hidden state beyond `(production, tokens)`; audited and found
none — every combinator in this library is a pure function of its input.

## Decision

Memoize `choice`/`choice2`/`choice3`/`many`/`many1`/`sepBy`/`lazy` (the
combinators that re-invoke child parsers while trying alternatives or
looping); leave `token`/`map`/`seq`/`optional` unmemoized — single-pass over
their children, so memoizing the children already captures the win.

Cache key is **`tokens[0]`, the `Token` object itself, in a
`WeakMap<Token, ParseResult<T>>`** — not the originally proposed
`tokens.length` in a `Map<number, _>` plus a manual reset call at `parse()`.
The length-keyed version was implemented first and broke immediately: `bun
test` surfaced 21 failures in a suite that calls `parseTypeExpression`
directly across many different type strings in one process, bypassing
`parse()`'s reset entirely — unrelated type strings collided on
remaining-token-count and silently returned the wrong parse. This was
exactly the risk flagged (unverified) before implementation; the test suite
caught the weaker design before it shipped, which is the validation
strategy working, not a sign the overall approach was wrong.

The lexer allocates a fresh `Token` object per lexical token per `Lexer`
run, so two `Token` objects are reference-equal only if they're the literal
same token from the same lex. Keying on that makes cross-parse cache
collision structurally impossible rather than avoided-by-remembering-to-
reset — no `resetParserMemo()` needed anywhere, `WeakMap` entries are
reclaimed by GC once a token stream is unreferenced. Strictly safer than
the proposal: fewer ways to get it wrong, no "did every entry point
remember to reset" surface to audit.

Confined entirely to `combinators.ts` — no `Parser<T>` signature change, no
touch to any of the ~150+ production call sites in `parser.ts`. The
length-as-position-key insight (a token slice is always a suffix of one
shared root per `parse()` call, so length alone would have been a valid
O(1) key) is what made the smaller blast radius possible in the first
place; the identity-keyed version keeps that same small footprint while
removing the reset-boundary risk entirely.

## Consequences

- `std/json.noo` Parse phase: ~15,490.9ms → 28-67ms (typically ~30ms
  JIT-warm), 230-500x.
- AST output confirmed byte-identical before/after
  (`JSON.stringify(parse(tokens))` on `stdlib.noo` and `std/json.noo`);
  full suite pass count unchanged aside from the fixed `parser-annotations`
  failures; suite wall time dropped as a side effect (other large-file
  parses hit the same mechanism).
- Left deliberately unaddressed: the secondary O(remaining-length) cost of
  `tokens.slice(1)` per token consumed (10.7B element copies in the
  original profiled run). Memoization caps *redundant* recomputation; each
  individual `token()` call still pays a slice proportional to remaining
  length. Not needed to hit the numbers above; a candidate follow-up if
  files grow enough for the constant factor to matter again.
- Re-tested against the worst known case (the abandoned combinator-style
  rewrite that hit 4m25s+): confirmed fixed, ~19-32ms, matching the
  hand-rolled baseline — validating that the fix addresses the mechanism
  generally, not just the one file it was diagnosed against.
