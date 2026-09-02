# Trait-constrained identifier used at 2+ types in one lambda doesn't resolve per call site

Status: open

Filed 2026-09-01, found while writing `implement Eq JsonValue` in `std/json.noo` (PR #191). Initially mischaracterized (in that file's comment and in agent memory) as "self-monomorphization inside `implement`" — re-investigated and narrowed to the actual trigger below.

## Symptom

```
variant JV = JNumber Float | JObject (List {String, JV});

implement Eq JV (
  equals = fn a b => match a (
    JNumber x => match b (JNumber y => equals x y; _ => False);
    JObject xs => match b (JObject ys => primitive_list_all2 (fn px py => (
        {kx, vx} = px;
        {ky, vy} = py;
        (equals (kx : String) ky) && (equals vx vy)
      )) xs ys; _ => False)
  )
);

equals (JNumber 1) (JNumber 1)
```

fails with `TypeError: Variant name mismatch: Bool vs JV` (or similar, pointing at one of the `equals` calls) — even though every individual call site's types are unambiguous on their own.

## What it is not (ruled out by direct testing)

- **Not self-recursion.** A trait method calling itself at the *same* type it's defining (`equals vx vy` alone, no other type mixed in, even nested in the same lambda) works fine.
- **Not specific to the type being `implement`ed, or to `Result`/arity-2 variants.** Reproduces with an unrelated, non-recursive, unary-trait, non-`Result` setup.
- **Not "anywhere in the same function body."** Three different concrete types (`Bool`, `Float`, `String`), each called via bare `equals` in its *own* `match` arm of the same outer function, all work fine — removing the `JObject`
  lambda entirely and keeping only top-level match-arm dispatch never breaks.
- **Not a general let-polymorphism/generalization bug.** An ordinary (unconstrained) polymorphic function used at two different types inside one function body works correctly:
  ```
  identity = fn x => x;
  f = fn a b => {identity a, identity b};
  f 1 "hello"  # => {1, "hello"} : {Float, String}, no error
  ```

## What actually triggers it

Two or more calls to the **same trait-constrained identifier**, each requiring a **different concrete instance**, inside **one single lambda expression** (`fn ... => ...`). Confirmed via isolation:

- One `equals` call in the lambda (even self-recursive on the type being defined): fine.
- Two `equals` calls in the lambda at two *different* types (e.g. `String` and the self type): breaks.
- The same two differently-typed calls split across two separate `match` arms of the *outer* function (not the same literal lambda): fine.

So the boundary is the single lambda body, not the enclosing `match`/function — each `match` arm appears to get its own resolution scope, but calls sharing one lambda body do not: the first occurrence's resolved instance appears to get reused (not re-resolved per call site) for the second.

A local non-trait helper function whose body itself calls the constrained identifier at two types propagates the same failure one level out, as a plain unification conflict instead of the "Variant name mismatch" wording — consistent with the same root cause, surfacing differently once the constrained call is no longer directly visible at the outer failure site.

## Workaround

Infix operators for trait methods that have one (`==` for `Eq`, presumably `<`/`>`/etc. for `Ord`) do not hit this — confirmed the exact `JObject` shape above works when every `equals` call is rewritten as `==`. Not a fix, just a different code path that happens to avoid it. No known workaround for trait methods without an infix form (`show`, `map`, `bind`, ...).

## Fix shape (not investigated)

Not attempted — would need tracing how constraint resolution is scoped during type inference: whether it's memoized/cached per-identifier-per-lambda instead of per-call-site, or whether unification of the constrained identifier's type variable is shared incorrectly across sibling call sites within one lambda's body. Likely related to, but a different code path from, the higher-kinded arity gap in `docs/internal/bugs/TRAIT_SYSTEM_ARITY_BUG.md` / `docs/internal/adrs/adr_0009.md` — both are trait-constraint-resolution gaps, but this one reproduces on ordinary arity-1 types and doesn't involve kind modeling at all.

## Trigger for picking this up

A future trait implementation needs 2+ differently-typed calls to a trait method with no infix form, in the same lambda, and can't restructure around it (e.g. can't split into separate `match` arms).
