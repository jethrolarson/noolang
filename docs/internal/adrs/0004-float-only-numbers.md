# 4. Numbers stay Float-only

Date: 2026-07-16

## Status

Accepted, with a stated trigger to revisit

## Context

JS doubles are the runtime substrate. A fixed-width `Int64` layered on top
would lie about its representation and would have to manufacture overflow
semantics the substrate doesn't exhibit — JS numbers don't wrap, they
silently lose precision past 2^53; introducing "integer overflow" as a
hazard would be importing a problem, not avoiding one. No dogfooded program
has yet produced a bug from a fractional value flowing where an integer was
meant.

## Decision

Stay Float-only. If this changes, reach for `Int` as a typer-level
*refinement* of `Float` ("integer-valued number"), not a fixed-width type:
same runtime representation, no overflow semantics to invent, `+ - * %`
close over it, and `/` already returns `Option Float` — division already has
its exit ramp from the integers. The real cost of that path is numeric-
literal polymorphism (is `3` an `Int` or a `Float`?) — either
constraint-typed literals with defaulting rules (Haskell's `Num a => a`,
notorious error messages) or a literal-syntax split, and every numeric trait
impl duplicating (`Add Int`, `Ord Int`, ...). That's real inference
complexity in a language that optimizes for LLM-predictable inference.

## Consequences

- Revisit only when a real program hits a bug caused by a fractional value
  where an integer was meant — not speculatively. Easier to add later than
  to remove.
