# 2. Structural constraints resolve by name, not object identity

Date: 2026-07-11

## Status

Accepted (landed, one deliberate gap remains)

## Context

Chained accessors didn't infer: `fn p => getCity (getAddress p)` returned
`a -> b` (constraint lost) instead of `a -> b given a has {@address {@city
b}}`; the inline form `fn obj => @name (@user obj)` inferred a constraint
whose leaf variable (`c`) was disconnected from the actual return type (`b`)
— a random var minted by `generateDepthFirstConstraints`, not the one
`unify` would ever bind.

Root cause: structural constraints lived on type-variable *objects* and
propagated by mutation, keyed by object identity, not by name.
`TypeState.constraints` (a name-keyed map) existed but nothing wrote to it.
A real composition primitive (`composeStructuralConstraints`) existed,
tested, unused. This was survivable while nothing copied constraint
structures — until `freshenRecordStructure` (deep-copies a constraint's
field types on instantiation) made a constraint's variable and the variable
`unify` later mutated provably different objects. Confirmed failure mode
during work on this: an early attempt lifted a *partial* constraint and
inferred the address record instead of the city string — a confidently
wrong concrete type, caught only because two pre-existing tests happened to
pin the old shape. This is the standing hazard: constraint/inference code
goes green and wrong at the same time; verify by reading inferred types
(`--types`), never by a green suite alone.

## Decision

Replace identity-keyed mutation with a name-keyed store
(`TypeState.constraints: Map<string, Constraint[]>`), resolved by walking
the substitution to a variable's representative name. Compose transitively
at function-type construction using the existing (previously dead)
`composeStructuralConstraints`, recursing through the constraint graph
rather than the syntax tree — this is what makes let-bound chains
(`getCity = @city; ... getCity (getAddr p)`) work, not just inline chains.
Delete `generateDepthFirstConstraints` once the store subsumes it. Lift a
constraint onto a function's return type only when its leaf variable *is*
the return variable — never a partial constraint.

## Consequences

- Object-identity divergence can no longer silently drop a constraint.
- One deliberate gap: constraint mutation was *not* removed from `unify`,
  and the `.constraints` field was *not* dropped from variable objects —
  the store is authoritative and enforcement reads both sources, so
  removing the object path is pure cleanup (rewiring the type printer and
  `propagateConstraintToTypeVariable`) for zero behavioral gain. Worth doing
  only alongside another reason to touch those two.
- One landmine, unreached: nested structures can't currently arrive at
  unification (composed constraints live on function types, not variables),
  so the recursive validator added alongside this is exercised only by unit
  tests, not by any real expression. If a future change routes a composed
  constraint through `unifyVariable`, that path is ready but unproven end to
  end.
- `findResultVariable` (bound a bare return variable to the *first*
  substituted field variable) was a trap for exactly the partial-constraint
  failure mode above; deleted as part of this work.
