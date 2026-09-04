# Kinded constructor calculus spike

Date: 2026-09-03

## Recommendation: proceed to a replacement ADR, not a production merge

The bounded revision meets ADR 0010's architectural gate. Noolang can represent
constructor variables and applications honestly, beta-reduce an explicit nominal
abstraction, and then use ordinary first-order unification. Local calls, plain
wrappers, partial applications, imported implementations, non-leading modeled
arguments, multiple modeled arguments, and shared fixed/free arguments all preserve
exact constructor order.

The four legacy mechanisms named by ADR 0010 are deleted rather than hidden behind
the new model. The prototype remains unsuitable for merge: `typefn` is provisional,
implementation members are still not checked against rigidly instantiated trait
signatures, and the complete PR #194 negative declaration matrix was not migrated.
A replacement implementation ADR should define production syntax and an atomic
migration plan. PR #194 should remain parked until that decision.

## Representation and boundary

- `ConstructorVariableType` and `TypeApplicationType` are real `Type` alternatives,
  distinct from nominal `VariantType` and concrete constructor substitutions
  (`src/ast.ts:113-140,198-200`).
- Parsing `f a` now builds a constructor variable plus application, not a lowercase
  variant (`src/parser/parse-type.ts:231-260`). Uppercase saturated nominal types keep
  their existing runtime representation.
- Trait declaration analysis assigns `Type -> ... -> Type` kinds and rejects
  inconsistent application arities (`src/typer/kinded-constructors.ts:57-120`;
  `src/typer/type-inference.ts:1760-1783`). There is no kind polymorphism or inference
  of unknown type-level functions.
- Provisional `typefn` remains restricted to implementation heads. Compilation
  requires one saturated nominal constructor and each modeled parameter exactly once
  as a direct argument (`src/parser/parser.ts`; `src/typer/kinded-constructors.ts:122-157`).
- Matching binds fixed/free arguments from the concrete nominal type, and beta
  reduction emits an ordinary `VariantType` or canonical `ListType`
  (`src/typer/kinded-constructors.ts:230-287`). No runtime type lambda exists.
- Runtime identity and coherence remain nominal. The abstraction rides on the existing
  trait implementation registry object, which module transport already copies
  (`src/typer/trait-system.ts:20-30,219-277`).

## Executable evidence

The focused matrix is in
`src/typer/__tests__/kinded-constructor-spike.test.ts`. Tests were changed to require
correct wrappers before the revision and failed red with dropped `RightMap` arguments
and the two `Result` regressions.

After the revision:

```text
AGENT=1 bun test
# 1480 passed, 8 skipped, 0 failed (1488 tests across 119 files)

NO_COLOR=1 bun src/cli.ts test stdlib.test.noo
# 89 passed, 0 failed across 2 suites

bun run typecheck
# pass

node validate_examples.js
# all validated markdown files pass
```

Exact manual inference probes:

| Probe | Inferred type |
| --- | --- |
| apply-shaped `Result` wrapper | `Result Float String` |
| `my_bind = fn res f => bind res f` | `Result Float a` |
| bare `b2 = bind` rebind | `Result Float a` |
| local non-leading `RightMap` partial application | `RightMap String Float` |
| local plain `RightMap` wrapper | `RightMap String Float` |
| imported plain `RightMap` wrapper | `RightMap String Float` (exact automated assertion) |
| two modeled arguments in `Framed frame left right` | `Framed String Float String` |
| shared free variable in `Outer error value (Option error)` | `Outer String Float Option String` |
| `Option` map | `Option Float` |
| canonical `List` map | `List Float` |

The full suite exposed and the revision fixed a composition edge:
`fn items => map show (map (fn x => x * 2) items)` initially detached the displayed
Functor constraint from its constructor variable. Constructor-variable substitution
now normalizes that relationship; the function infers
`a Float -> a String given a implements Functor`, and applying it to a list infers
`List String`.

## ADR 0010 questions

### 1. Which special cases were deleted?

All four named mechanisms:

1. **Lowercase fake-variant detection.** Trait signatures no longer encode `f a` as a
   `VariantType`, and the lowercase-name scan was removed from
   `trait-function-handling.ts`.
2. **Variant `traitConstraint` metadata.** The prototype never introduced this PR #194
   field; constraint identity remains on function/constrained types and constructor
   identity has its own type node.
3. **Positional append/slice reconstruction.** The trailing `slice` in `unify.ts` and
   appended `substitutedName.args` in `substitute.ts` are gone. `substitute` has one
   application case that flattens arguments and beta-reduces a selected constructor
   (`src/typer/substitute.ts:43-69`).
4. **Trait-specific List normalization.** Synthetic `VariantType("List")` substitution
   and `normalizeListType` are gone. The `List` abstraction directly reduces to
   canonical `ListType`.

A repository search for `extraArgs`, `substitutedName.args`, `normalizeListType`,
`traitConstraint`, `tryUnifyConstrainedVariant`, and lowercase-constructor detection
returns no implementation matches.

### 2. Does one substitution/application path cover local calls, wrappers, and imports?

Yes. Generic signatures retain `TypeApplicationType`; concrete dispatch selects the
nominal abstraction; both direct constrained applications and constrained wrapper
results install the same `ConstructorType`; `substitute` beta-reduces it before the
ordinary unifier (`src/typer/unify.ts:916-979,1020-1095`). Imported registries transport
the same implementation object, so no module-specific reconstruction exists.

### 3. What remains nominal or trait-specific?

Necessarily nominal:

- registry and evaluator dispatch identity;
- coherence and manifest keys `(trait, constructor)`;
- validating that an abstraction ends in an allowed nominal constructor;
- matching fixed/free nominal arguments before beta reduction.

Necessarily trait-specific:

- determining the constructor parameter's declared kind;
- selecting an implementation for an `implements` constraint;
- conditional-instance checks and eventual member compatibility checking.

Value traits (`Eq`, `Show`, arithmetic), conditional instances, primitives, effects,
and runtime dispatch retain their previous model.

### 4. Is unification still first-order after reduction?

Yes. The only constructor-variable unification is first-order name substitution between
explicit constructor variables of fixed kinds. A concrete implementation is never
inferred as an unknown type function. Once selected, beta reduction produces ordinary
Noolang value types before structural/nominal unification. There is no higher-order
unification, composition, kind polymorphism, higher rank, or escaping lambda value.

### 5. Is migration smaller and safer than ADR 0009?

The measured core diff (AST/parser and typer source, excluding tests/report/docs) is
819 insertions and 472 deletions, net +347 lines. Raw size is not tiny because every
existing type traversal must acknowledge the two honest nodes. It is nevertheless
smaller in state space than ADR 0009/PR #194: there is no slot descriptor algebra,
variant metadata, List bridge, or separate module descriptor transport, and the old
reconstruction code is deleted. Exact wrapper and composition probes show the safety
benefit: constructor/argument relationships survive generalization rather than being
recovered later.

This is evidence for the architecture, not an estimate for polished production work.
Member validation and syntax design remain material tasks.

### 6. Proceed, revise, or retain the descriptor approach?

**Proceed to a replacement ADR.** The bounded revision removed the known special-case
surface and passed the mandatory order probes. Do not merge this spike or unpark PR
#194 automatically. If production member validation or syntax work later requires a
parallel slot descriptor/reconstruction channel, that would falsify this recommendation
and the project should retain the parked bounded approach instead.

## Deliberate gaps

- `typefn` spelling and placement are not permanent syntax.
- Implementation member types are not yet checked against rigid trait signatures;
  therefore the wrong-head/member negative test is not evidence this spike claims.
- Alias/newtype eligibility and improved kind diagnostics need production design.
- The stdlib's `Applicative Option::apply` was expanded to a direct nested match because
  typing an implementation body through its own unresolved trait method depends on
  member-signature checking. Runtime behavior is unchanged and stdlib tests pass.
