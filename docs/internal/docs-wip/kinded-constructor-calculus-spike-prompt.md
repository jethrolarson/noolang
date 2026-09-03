# Spike prompt: kinded constructor calculus for higher-kinded traits

Start from current `origin/main` in a fresh worktree. Read
`AGENTS.md`, `docs/internal/bugs/TRAIT_SYSTEM_ARITY_BUG.md`,
`docs/internal/adrs/adr_0009.md`, and `docs/internal/adrs/adr_0010.md` fully.
Inspect parked PR #194 and its `explicit-trait-slots` tests as behavioral evidence,
but do not treat its implementation or `_` syntax as the desired architecture.

Prototype whether a small kinded constructor core can replace Noolang's
trait-specific higher-kinded encodings. The observed problem is that `f a` is a
lowercase `VariantType`, so arity, constructor identity, argument placement,
substitution, `List` normalization, and constraint metadata are recovered in
several paths. PR #194 fixes the known cases but review repeatedly found new
edges. The spike succeeds only if a more honest representation reduces those
paths rather than wrapping them.

Use the smallest model that can test the hypothesis:

- kinds `Type` and arrow kinds;
- distinct constructor, variable, and type-application representation;
- explicit, compile-time constructor abstraction, using `typefn` only as
  provisional spike syntax;
- beta-reduction before first-order unification;
- fixed nominal coherence and runtime dispatch identity.

Guard the boundary: do not redesign effects, add general higher-order
unification, infer unknown type-level functions, add kind polymorphism,
higher-rank types, constructor composition APIs, overlapping instances, or
runtime type-lambda values. Initially require each abstraction parameter exactly
once in a direct argument of one saturated nominal constructor. Preserve
ordinary value traits, conditional `Eq`/`Show`, primitives, and canonical
`List` behavior.

Use tests before implementation. Reproduce PR #194's behavioral matrix,
including exact inferred types for the `apply` wrapper, `my_bind`, bare rebind,
`Option`/`List`, a binary constructor modeled at a non-leading argument,
multiple modeled arguments, fixed arguments, shared free variables in grouped
fixed applications, declaration-time malformed-head/member failures, and local
versus imported dispatch. Inference correctness matters more than a green suite;
probe exact `--types` output manually.

Produce a spike report in `docs/internal/research/` that answers, with code
references and measured evidence:

1. Which existing special cases can be deleted rather than adapted?
2. Does one substitution/application path cover local calls, wrappers, and
   imported metadata?
3. What remains necessarily nominal or trait-specific?
4. Does the prototype stay first-order after explicit abstractions are reduced?
5. Is production migration smaller and safer than completing ADR 0009?
6. Should the project proceed, revise the model, or retain the parked descriptor
   approach?

Prototype code may be incomplete, but it must not claim success unless the exact
argument-order probes pass and the simplification criteria in ADR 0010 are met.
Run focused tests and typecheck during exploration; run the full suite,
stdlib tests, and documentation validation only if presenting the prototype as
behaviorally complete. Prefer an honest negative result over preserving old
machinery to make the tests green.
