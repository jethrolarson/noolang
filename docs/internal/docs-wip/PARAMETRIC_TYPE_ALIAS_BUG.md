# Parametric `type` aliases parse but don't expand under unification

Filed 2026-08-01, found while building `std/parser.noo` (the parser-
combinator forcing function, one level down from `std/json.noo`/PR #165).
Worked around by not using a `type Parser a = ...` alias at all — every
combinator in `std/parser.noo` is a plain unannotated function, and its
generic shape is carried by ordinary Hindley-Milner inference instead
(same approach `std/json.noo` already used for `result_bind`/`result_map`).

## Symptom

A non-parametric `type` alias unifies fine against its expansion. The same
alias with a type parameter parses without error, but any ascription
against an applied instance of it (`Alias ConcreteType`) fails to unify
against the type it's supposed to be an alias *for* — as if the alias
parameter were never substituted into the body at all. Minimal repro:

```
type Box = {@value Float};
mkBox = fn v => {@value v};
b = (mkBox 42 : Box);
b | @value
```
types fine (`Float`). Parameterize it:
```
type Box a = {@value a};
mkBox = fn v => {@value v};
b = (mkBox 42 : Box Float);
b | @value
```
```
TypeError: Cannot unify types
  Expected: { value: Float }
  Got:      Box Float
  at line 3, column 6
```

`Box Float` is being treated as an opaque nominal type application, not
expanded to `{@value Float}` before unifying against the inferred
`{ value: Float }`.

## Where it likely lives (not fully diagnosed — bounded effort)

`typeUserDefinedType` in `src/typer/type-inference.ts` (~line 1172)
registers the alias: it builds `userType` from the definition (record/
tuple/union) with the parameter left as `typeVariable(param)` inside the
stored type, and stores `{ type: userType, quantifiedVars: typeParams }` in
the environment. That's plausible for a *value*-level generic scheme (like
any other polymorphic binding), but a `type`-level reference such as
`Box Float` appearing in *type-expression* position (inside an ascription
or annotation) needs a different resolution path — substituting `Float` for
the alias's `a` in `userType` before use, i.e. beta-reducing the type
application. Whatever resolves a bare type name in a type expression to its
`environment` entry doesn't appear to do that substitution for the
parametric case; the non-parametric case works because there's no
parameter to substitute, so simply returning the stored type is already
correct by coincidence. Not traced further than this — the actual
resolution site (wherever `UserDefinedTypeExpression`-produced schemes get
looked up when a name like `Box` appears applied to arguments inside
`parseTypeExpression`'s output) wasn't located precisely; whoever picks
this up should start by finding where a bare (non-parametric) type name
gets looked up and substituted, then check why the parametric case's
`quantifiedVars`/args aren't fed through the same path.

## Impact / workaround

Every one of `std/json.noo`'s and `std/parser.noo`'s generic-shaped values
(`Result {@value a, @pos Float} ParseError`, etc.) already avoided this by
never declaring a parametric alias for it — they just leave the shape
anonymous/structural and let inference carry it. That's a real workaround,
not just a style choice: it works precisely because it never asks the
typer to expand a parametric alias. `docs/internal/docs-wip/
JSON_PARSER_PLAN.md`'s reasoning to keep `JsonValue` a concrete `variant`
(not `Unknown`) is unaffected — `variant`s go through a completely separate,
working path for type parameters (`pattern-matching.ts`'s `adtInfo.
typeParams` substitution, confirmed working via `Option`/`Result`/`List`
themselves, all of which are `variant`s under the hood). This bug is
specific to `type` aliases (`union-type`/`record-type`/`tuple-type`
definitions), not variants.

## Trigger for picking this up

Anyone reaching for `type Name a = ...` as a documentation/readability aid
over a recurring generic shape (the natural thing to want for a
"`Parser a`"-style combinator library) hits this the moment they try to
ascribe or annotate anything against the applied form. Low usage so far
(nothing in the shipped stdlib declares a parametric `type` alias) — likely
undiscovered until now because `std/json.noo`/`std/parser.noo` are the
first stdlib code with a natural use case for one.
