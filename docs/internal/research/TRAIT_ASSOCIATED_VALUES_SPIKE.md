# Trait-associated values spike

Status: recommendation for a follow-up implementation (2026-09-24)

## Recommendation

Proceed, but treat this as a small new dispatch path rather than as a relaxation of the existing function-only check. The parser and nominal instance/coherence machinery already support most of the surface syntax, and rigid implementation checking can be generalized cleanly. The material missing piece is **type-directed zero-argument selection**: current trait dispatch learns an instance from call arguments, while an associated value has no runtime argument from which to dispatch.

Scope the first implementation to immutable members selected by an explicit or otherwise locally available expected type. Do not make an unconstrained use select the sole registered instance. Preserve the proposal's exclusions (defaults, mutable members, associated types) and constructor-wide coherence.

Risk: **medium-high in the typer, medium overall**. Registration and instance validation are localized; contextual selection and carrying that selection to evaluation are the risky parts. The trait application code is already complex and should not be extended with a fake zero-argument function.

## Evidence from the current implementation

### Parsing and AST

The syntax already parses values:

- `parseConstraintFunction` accepts any `Type`, not only a function type (`src/parser/parser.ts:1510-1524`).
- `parseImplementationFunction` accepts any expression on the right of `=` (`src/parser/parser.ts:1553-1566`).
- The AST names are function-oriented, but do not structurally require callability: `ConstraintFunction.type` is `Type` and `ImplementationFunction.value` is `Expression` (`src/ast.ts:602-633`).

No grammar work is required for the proposed syntax. Renaming those AST types to member-oriented names is desirable but not required for a first implementation.

### Registration currently drops values

`typeConstraintDefinition` creates `functionMap: Map<string, FunctionType>` and inserts a declaration only when `type.kind == 'function'` (`src/typer/type-inference.ts:1885-1932`). Therefore `empty : container a` is silently omitted. `typeImplementDefinition` subsequently looks only in `traitDef.functions`, producing the documented `Function 'empty' not required...` error (`src/typer/type-inference.ts:2158-2164`).

There is a second observable consequence: a trait containing only `empty : container a` computes constructor arity zero because `constructorParameterArity` scans only the retained function signatures. The valid head `(typefn a => List a)` then fails with `typefn has 1 parameter(s), expected 0`. A trait that also declares `insert : a -> container a -> container a` correctly infers arity one, but still rejects `empty` as undeclared.

### Existing implementation checking is reusable

The implementation path already has the right foundations:

- explicit higher-kinded heads are compiled and validated by `compileConstructorAbstraction` (`src/typer/kinded-constructors.ts:170-205`);
- `expectedMemberType` substitutes the trait parameter with either the concrete target or constructor abstraction (`src/typer/type-inference.ts:2068-2084`);
- `assertMemberCompatibility` rigidifies the expected signature before unification, preventing an implementation from specializing a universally quantified member (`src/typer/type-inference.ts:2086-2114`);
- `saturateValueImplementationTarget` already supplies fresh arguments for an unsaturated nominal target (`src/typer/type-inference.ts:1954-1967`). Its name and behavior appear deliberately suitable for values even though the registry currently rejects them.

These helpers should be generalized from `FunctionType` to `Type`, retaining function effect-spine checks for callable members. For a non-callable associated value, the implementation expression's immediate `TypeResult.effects` must be empty unless the language gains syntax for declaring initialization effects. Allowing effects here would make module capture perform hidden initialization work.

### Current dispatch cannot evaluate a value

Typing a variable checks `isTraitFunction` and returns the registered function signature (`src/typer/type-inference.ts:144-189`). Function dispatch itself runs only from application typing (`handleTraitFunctionApplication`, `src/typer/trait-function-handling.ts:31-110), and `resolveTraitFunction` immediately fails when there are no argument types (`src/typer/trait-system.ts:179-190`). Runtime variables likewise produce a `trait-function` value, which is resolved only when applied (`src/evaluator/evaluator.ts:1946-1978`, `3053-3198`).

An associated value therefore must not be represented as a nullary Noolang function. Noolang's function and effect semantics would be wrong, and there is no call site to trigger existing dispatch.

The concrete acceptance expression is a useful narrow contextual boundary: `typeTyped` currently infers the inner expression before unifying it with the annotation (`src/typer/type-inference.ts:1801-1849`). A minimal implementation can special-case an associated-value variable in expected-type position, select the instance from the resolved annotation, and record the selection on that variable. A larger bidirectional-typing rewrite is not necessary for the stated example.

Selection must be preserved explicitly on the AST (for example `VariableExpression.traitSelection = { traitName, typeName }`). The evaluator cannot safely rediscover it from the runtime value: there is no dispatch argument, and type annotations are erased (`src/evaluator/evaluator.ts:1879-1884`). The evaluator should evaluate the selected member from the chosen `TraitImplementation`, preferring a captured value and otherwise using a per-implementation cache.

### Runtime and modules are close, but currently function-specific

`TraitImplementation` stores member ASTs in `functions` and imported-module closures in `evaluatedFunctions` (`src/typer/trait-system.ts:26-41`). Module loading carries the same implementation objects through `traitImplDiff`, while `captureInstanceClosures` evaluates every registered function after the defining module has completed and attaches captured values (`src/module-loader.ts:345-498`). This is the correct lifecycle for associated values too: capture once in the defining environment after all bindings exist.

Generalize this storage to distinguish callable members from values (recommended), or add parallel `values`/`evaluatedValues` maps. Do not repeatedly evaluate the AST fallback on every associated-value use; immutable values should have stable evaluation and effects must not repeat. Imported definitions and implementations already merge through the registry (`src/module-loader.ts:663-750`), so no manifest schema change is needed: manifests track trait/type ownership, not member shapes.

Duplicate/coherence behavior is already constructor-wide: `addTraitImplementation` rejects a second `(traitName, typeName)` entry (`src/typer/trait-system.ts:99-149`), and module manifests use that same pair (`src/typer/module-manifest.ts:49-54`, `109-141`). Keep this unchanged.

## Minimal viable design

1. **Represent members explicitly.** Prefer `TraitDefinition.members: Map<string, { kind: 'function' | 'value'; type: Type }>` and equivalent implementation/captured-value maps. If migration cost is a concern, retain `functions` and add `values`; avoid casting value types to `FunctionType`.
2. **Register every declaration.** Split by `type.kind`, and compute constructor arity over all member types. Register names in separate callable/value indices so application logic remains unchanged.
3. **Validate implementations by member kind.** Reject undeclared members, duplicate names, missing members, and function/value kind mismatches. Use rigid substitution/unification for both. Preserve current function arity/effect checks; require zero immediate effects for values.
4. **Resolve values from expected types.** Add a resolver taking `(memberName, expectedType, state)` that enumerates all defining traits, uses nominal identity plus `satisfyTrait`/constructor-abstraction matching, and returns exactly one `(trait, implementation)` or a structured missing/ambiguous result. It must not fall back to “only implementation in the registry.”
5. **Start with explicit expected-type sites.** In `typeTyped`, detect a direct associated-value variable, resolve against the annotation, verify the instantiated declaration type, and decorate that variable with the selected trait/type. Ensure definition annotations flow through the same `TypedExpression` path. An unselected associated value in `typeVariableExpr` should produce an ambiguity/insufficient-type-information diagnostic rather than a polymorphic value that later reaches runtime.
6. **Evaluate the recorded selection.** On a selected variable, fetch the exact implementation/member. Use the module-captured value when available; for inline programs lazily evaluate and memoize once. Keep ordinary lexical variables higher priority, matching current trait-function behavior.
7. **Generalize module capture.** Capture associated values alongside closures after full module evaluation and preserve them in cached implementation objects. Add cross-module tests before changing docs or stdlib.

A later phase may thread expected types through arbitrary expression typing (arguments, record fields, branch expectations). That is useful but should not be a prerequisite for the explicit annotation acceptance case.

## Edge cases and required decisions

- **No expected type:** `empty` must report that `Container` selection needs a result type, even if only `List` is implemented.
- **Multiple traits reuse a member name:** current function lookup chooses the first defining trait in some paths. The new value resolver must enumerate all candidates and report ambiguity, never inherit this behavior.
- **Same trait, several nominal constructors:** `empty : List Float` selects `List`; `empty : Option Float` selects `Option`; a type variable or unsaturated constructor remains ambiguous.
- **Higher-kinded rigidity:** `empty = []` is valid for `Container (typefn a => List a)` because it is polymorphic; `empty = [0]` must fail because it only provides `List Float`, not `List a` for every `a`.
- **Conditional implementations:** selection should call `satisfyTrait`, so unresolved or failed `given` constraints do not silently choose an instance.
- **Aliases:** use the same alias resolution and nominal-target rules as implementation registration. Erased aliases must not create dispatch identity.
- **Effects:** a value expression performing `!write`, `!read`, etc. must be rejected in v1. Function-valued associated values continue to declare effects in their function type and should remain callable members under the structural `type.kind === 'function'` split.
- **Evaluation identity:** capture/memoize once. Re-evaluation would be observably wrong if nondeterministic FFI ever slipped through and wasteful even for pure values.
- **Recursive/self-referential values:** do not add special support. Existing top-level ordering/undefined-variable rules should apply during typing and capture.
- **Trait type parameters:** the registry currently models only `typeParams[0]` as the dispatch parameter. This feature should support higher-kinded use of that parameter, but should not claim to introduce true multi-parameter trait selection.
- **Constructor-wide coherence:** two abstractions with the same nominal constructor remain duplicates, consistent with ADR-0010 and current registry keys.

## Acceptance tests for implementation

Add focused TS tests (unskip and correct the old syntax/name) covering:

1. parser retains `empty : container a` as a member;
2. value-only higher-kinded trait infers constructor arity one;
3. missing associated value is rejected;
4. undeclared associated value is rejected with “member/value”, not “function” wording;
5. `empty = []`, selected by `empty : List Float`, infers exactly `List Float` (also verify with `NO_COLOR=1 bun src/cli.ts --types ...`);
6. the same program evaluates to `[]`;
7. bare `empty` reports insufficient type information even with one implementation;
8. List and Option implementations select by annotation, independent of registration order;
9. duplicate List implementation still fails constructor-wide;
10. `[0]` fails the rigid `List a` requirement;
11. effectful associated-value initialization is rejected;
12. a member name shared by two traits gives a deterministic ambiguity diagnostic;
13. an implementation with unsatisfied `given` constraints is not selected;
14. a defining module can use a local helper in an associated value, export it, and an importer receives the captured value;
15. importing two modules with conflicting `(trait, constructor)` instances retains the existing coherence failure;
16. all existing trait-function tests remain unchanged and green.

Run `AGENT=1 bun test`, `bun run typecheck`, `node validate_examples.js`, and manual `--types` plus runtime probes for the exact List example. The manual type probe is mandatory because this typer can pass tests while inferring an overconfident wrong concrete type.

## Reasons not to proceed

There is no architectural blocker. Defer only if the intended product semantics require associated values to resolve in arbitrary implicit contexts immediately; that requirement would turn the work into a broader expected-type/bidirectional inference project. Under the proposal's explicit context example and ambiguity rule, the scoped design above is technically plausible and keeps function dispatch stable.

## Spike commands/results

- Exact value-only proposal: `typefn has 1 parameter(s), expected 0` (the declaration was dropped before arity inference).
- Proposal plus callable `insert`: `Function 'empty' not required by trait 'Container'`.
- Callable-only control using the same `typefn`: inferred `List Float`, confirming current higher-kinded constructor matching works.
- Existing marker test: `AGENT=1 bun test test/type-system/trait-associated-values.test.ts` reports one skipped test and no failures.

No interpreter source was modified and no throwaway experiment was retained.
