# Trait-associated values

Status: implemented

## Current behavior

Constraint declarations and implementations support callable members. A declaration such as `empty : container a` parses, but the trait registry does not register it as a required member; an implementation containing `empty = []` therefore fails with `Function 'empty' not required by trait 'Container'`.

The old skipped test did not isolate this limitation. It used uppercase `ContainerType`, which is a nominal constructor rather than a type variable, and the pre-ADR-0010 `implement Container List` head. Valid higher-kinded syntax uses a lowercase constructor variable and an explicit abstraction, for example `implement Container (typefn a => List a)`.

## Proposed boundary

Traits may declare immutable associated values in addition to functions. Selection remains nominal and type-directed: a use must provide an explicit expected type annotation to choose an implementation. This feature does not add mutable members, default definitions, associated types, or selection based only on there being a single implementation.

## Acceptance criteria

- `empty : container a` is registered as a required associated value, while existing function members are unchanged.
- Implementations must provide every declared value and may not provide undeclared members.
- Associated values are checked rigidly against the selected implementation's constructor abstraction and declared effects.
- A contextually determined use such as `empty : List Float` selects `Container (typefn a => List a)`, infers `List Float`, and evaluates to that implementation's value.
- A use without enough type information reports ambiguity rather than choosing an arbitrary implementation.
- Associated values preserve their behavior through module export/import, and duplicate/coherence checks remain constructor-wide.
