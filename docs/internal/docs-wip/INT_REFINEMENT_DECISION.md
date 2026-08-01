# Float-only numbers: deliberate, with a trigger for revisiting

Decision (2026-07-16): Noolang stays Float-only. This is a choice, not a TODO.

## Why Float-only is correct today

- JS doubles are the substrate. A fixed-width `Int64` over doubles would lie about
  its representation — and would have to *manufacture* overflow semantics the
  substrate doesn't exhibit. (JS numbers don't wrap; they silently lose precision
  past 2^53. "Integer overflow" is not a hazard we have; let's not import one.)
- No dogfooded program has yet produced a bug caused by a fractional value where
  an integer was meant. YAGNI holds until one does.

## The design to reach for if that changes: refinement Int, not fixed-width Int

`Int` as a typer-level refinement of Float — "integer-valued number":

- Same runtime representation (JS number). No width promise ⇒ no overflow
  semantics to invent, nothing to check at runtime.
- `+ - * %` close over Int. `/` already returns `Option Float`, so division —
  the one operation that leaves the integers — already has its exit ramp.
- What it buys is domain honesty, not arithmetic safety: `exit 1.5`,
  `list_get 0.5`, fractional counts become type errors.

## The real cost (and it isn't overflow)

Numeric-literal polymorphism. Is `3` an Int or a Float? Either literals get
constraint-typed (Haskell's `Num a => a` with defaulting rules and their
notorious error messages) or literal syntax splits. Every numeric trait impl
duplicates (`Add Int`, `Ord Int`, …). That's inference complexity in a language
that optimizes for LLM-predictable inference — a genuine price.

## Trigger condition

Revisit when a real program hits a bug caused by a fractional value flowing
where an integer was meant — not before. Easier to add than remove.
