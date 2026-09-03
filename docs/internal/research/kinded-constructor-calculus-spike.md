# Kinded constructor calculus spike

Date: 2026-09-03

## Recommendation: revise, do not merge this prototype

The constructor calculus is promising but does not yet meet ADR 0010's proceed gate.
A provisional `typefn` target can model a non-leading argument and the same compiled
abstraction survives module transport. A partially applied local or imported trait
method beta-reduces to the correct `RightMap String Float`. However, a plain lambda
wrapper still loses the constructor constraint and confidently infers the wrong
`RightMap Float`, dropping the fixed leading argument. The existing `Result` apply
and bind wrapper regressions also remain.

This is enough evidence to revise the model once, specifically by representing the
constructor variable and its applications honestly in trait signatures. If that
revision still needs wrapper-specific metadata or reconstruction, retain ADR 0009's
bounded descriptor approach instead. PR #194 should remain parked meanwhile.

The prototype is deliberately deletable evidence. `typefn` is not proposed syntax,
and none of this branch should merge as production behavior.

## What was built

- `Type` now has an internal constructor value, while constructor terms distinguish
  `nominal-constructor`, `constructor-variable`, and `type-application`
  (`src/ast.ts`; `src/typer/kinded-constructors.ts:11-19, 113-125`).
- The provisional implementation target
  `implement RightFunctor (typefn value => RightMap context value) ...` is parsed only
  in an implementation head (`src/parser/parser.ts:1547-1598`).
- Declaration compilation checks the trait's application arity, nominal saturation,
  and the initial linear/direct-argument restriction
  (`src/typer/kinded-constructors.ts:62-126`; registration at
  `src/typer/type-inference.ts:1745-1790`).
- Matching binds fixed/free constructor arguments from the dispatched concrete type;
  beta-reduction substitutes both those bindings and modeled arguments
  (`src/typer/kinded-constructors.ts:203-271`).
- Constructor values travel on the existing nominal trait implementation object, so
  the module loader transports them without a second metadata channel
  (`src/typer/trait-system.ts`; existing transport in `src/module-loader.ts`).
- `substitute` beta-reduces a constructor application before ordinary unification
  (`src/typer/substitute.ts`; selection in `src/typer/unify.ts:984-1012`). Runtime
  dispatch and coherence remain keyed by `(trait, nominal constructor)`.

## Executable evidence

The focused spike test is
`src/typer/__tests__/kinded-constructor-spike.test.ts`.

TDD began with four parser-red tests (0 passed, 4 failed). After the prototype, the
focused regression set reports 43 passed, 0 failed:

```text
AGENT=1 bun test \
  src/typer/__tests__/kinded-constructor-spike.test.ts \
  src/typer/__tests__/trait-call-site-polymorphism.test.ts \
  src/typer/__tests__/monad-result-arity.test.ts \
  test/integration/module-loader.test.ts
# 43 pass, 0 fail
```

`bun run typecheck` passes. The full suite, stdlib module suite, and documentation
validation were intentionally not run because the stopping rule was reached and the
prototype is not behaviorally complete.

### Exact inference probes

| Probe | Result |
| --- | --- |
| Local non-leading `typefn`, through `mapper = right_map (fn ...)` | `RightMap String Float` |
| Same partial application after importing implementation and constructor | `RightMap String Float` (automated exact assertion) |
| Bare `b2 = bind` rebind | `Result Float a` |
| `map` over `Option` | `Option Float` |
| `map` over canonical `List` | `List Float` |
| Plain `my_right_map = fn f rm => right_map f rm` wrapper | wrong: `RightMap Float` (expected `RightMap String Float`) |
| `my_bind = fn res f => bind res f` | fails: `Variant name mismatch: α331 vs Result` |
| Apply-shaped `Result` wrapper | fails: `Variant arity mismatch: Result has 1 vs 2 type arguments` |

The spike also has declaration-red assertions for an unsaturated nominal body and a
parameter that is nested/duplicated rather than occurring exactly once directly.
It does **not** cover multiple modeled parameters, fixed concrete arguments, shared
free variables in grouped fixed applications, implementation-member compatibility,
or the full PR #194 negative matrix. Those omissions are intentional rather than
reported as success.

## ADR 0010 questions

### 1. Which existing special cases can be deleted rather than adapted?

On the new path, argument placement is beta-reduction, not positional recovery. That
can replace:

- trailing-argument slicing in `src/typer/unify.ts:1067-1080`;
- argument appending in `src/typer/substitute.ts:101-115`;
- synthetic `List` constructor substitution and later normalization in
  `src/typer/substitute.ts` and `src/typer/trait-function-handling.ts:456-457,655-681`;
- lowercase-name constructor-variable discovery in
  `src/typer/trait-function-handling.ts:128-139`.

They cannot be deleted on this branch: stdlib and trait signatures still use the old
lowercase `VariantType` representation. The prototype therefore demonstrates the
replacement operation but not the required net deletion.

### 2. Does one substitution/application path cover local calls, wrappers, and imported metadata?

No. Local and imported partial applications share one path and preserve non-leading
argument order. Plain wrappers do not: constructor constraints are lost when a fully
applied unresolved trait call is generalized inside a lambda. Fixing this by tagging
ordinary variants would recreate the metadata problem ADR 0010 is trying to remove.
The next revision should make trait-signature constructor variables/applications real
nodes and preserve their constraint as part of that typed representation.

### 3. What remains necessarily nominal or trait-specific?

Nominal identity remains necessary for coherence, registry lookup, module manifests,
and evaluator dispatch. Trait-specific work remains at declaration validation,
implementation selection, conditional-instance checking, and member compatibility.
Kinds and beta-reduction do not replace those responsibilities.

### 4. Does the prototype stay first-order after explicit abstractions are reduced?

Yes on the demonstrated path. `typefn value => RightMap context value` is selected by
nominal identity, fixed/free `context` is matched to `String`, and beta-reduction emits
ordinary `RightMap String a` before `unify` sees it. No higher-order unification or
unknown type-level-function inference is present. The wrapper failure occurs before
that boundary because the constructor constraint is no longer available.

### 5. Is production migration smaller and safer than completing ADR 0009?

Not yet demonstrated. The core itself is smaller than PR #194's descriptor machinery,
but a production migration must replace trait-signature fake variants and remove the
old paths atomically. Until the wrapper boundary works without a parallel metadata
channel, claiming a smaller migration would be misleading.

### 6. Proceed, revise, or retain the parked descriptor approach?

**Revise once, within the same narrow scope.** Replace lowercase fake variants in
trait signatures with an explicit constructor-variable/type-application form, then
rerun PR #194's exact matrix. Proceed only if that permits deleting the four legacy
paths listed above and wrappers/imports use the same beta-reduction path. Otherwise
retain ADR 0009/PR #194's descriptor design as the cheaper bounded fix.
