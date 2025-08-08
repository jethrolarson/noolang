### Unknown, FFI, and Refinement Policy (WIP)

#### Illustrative examples

Import data

```noolang
user = ffi "node" "process.env" : Unknown !ffi;

result = user
  | decode (record { @name string, @age float })
  : Result {@name String, @age Float} String !ffi;

greeting = result |? @name |? concat "hi ";
```

Import and use a function

```noolang
fs = ffi "node" "fs";

result = fs | @readFileSync? |? call_ffi string ["file.txt"] : Result String String !ffi;
```

#### Scope

- Define safe interaction between Unknown values, FFI, and effects.
- Keep everyday code pure; make foreign boundaries explicit and auditable.

#### Core rules

- **Unknown is inert**: No arithmetic, comparison, function call, `@field`, tuple/record destructuring. Only tag-match and optional accessors are allowed.
- **Tag-match is pure**: Matching on Unknown by runtime tag (String, Float, Bool, Unit, List, Function, Error, Opaque(kind), RecordTag) performs no property reads/calls and adds no effects.
- **Structural ops are effectful**: The only structural reads/calls are:
  - `@field? : Unknown -> Option Unknown !ffi`
  - `at : Float -> (List a | Tuple {..} | Unknown) -> Option a` (pure on native lists/tuples; `!ffi` when input is `Unknown`)
  - `call    : Unknown -> List Unknown -> Unknown !ffi`
- **!ffi is non-erasable at use sites**: Any function that uses `@field?`, `index?`, or `call` must declare `!ffi`. Callers inherit `!ffi` transitively.
- **No implicit coercion**: Unknown never unifies with concrete types or containers. Only decoders construct typed values.
- **Branch-local refinement**: Refinements from matches do not escape the branch; outside, the value remains Unknown (and ffi-tainted).

#### Schema/decoder model (Zod-like)

- **Type**: `Schema a`
- **Primitives**: `string`, `float`, `bool`, `unit`
- **Combinators**: `list s`, `tuple {s1, s2, ...}`, `record { @f s, @g (option s) }`, `union [s1, s2, ...]`, `literal v`, `enum [v1, ...]`, `refine s (a -> Bool) msg`, `map s (a -> b)` (pure)
- **APIs**:
  - `decode : Schema a -> Unknown -> Result a DecodeError !ffi`
  - `guard  : Schema a -> Unknown -> Option a !ffi`
- Decoders validate structure via effectful ops, then construct pure, typed data. Downstream consumers of decoded values are pure if they do not cross FFI again.

#### Foreign function calls

- Single API: `call_ffi : Schema res -> Unknown -> List Unknown -> Result res (EncodeError | DecodeError) !ffi`
  - Encodes args (auto encodability check), calls foreign function, decodes result via `res_schema`.
  - Treat functions as unary; pass N args as a list/tuple.
  - Effects: always `!ffi` (application of foreign behavior).

#### Effects policy

- **Introduction**: `ffi ...` and `forget x` produce Unknown values marked by provenance (ffi-taint).
- **Refinement is pure**: Tag matches/checked casts are pure and never clear taint.
- **Use triggers !ffi**: Property/index access and foreign function calls require `!ffi` at the use site.
- **Typed manifests do not erase !ffi**: Declarations remove Unknown but must retain declared effects. Only vetted intrinsics may omit `!ffi`.
- **forget is pure**: `forget : a -> Unknown` introduces Unknown without `!ffi`. Elimination/structure rules remain identical to FFI-origin Unknown.

#### Minimal operational surface

- **Unknown ops**: `@field?`, `at`, `call_ffi` (all `!ffi` when input is `Unknown`).
- **Elimination**: tag-match; `decode`/`guard`.
- **Chaining**: use `|?` with Option/Result.

#### Invariants (to verify)

- **Unknown-inert**: Well-typed programs that only tag-match Unknown never execute foreign code.
- **Taint monotonicity**: If `f` lacks `!ffi`, evaluation of `f` never crosses FFI.
- **Non‑erasability**: Any structural access/call on foreign values forces `!ffi` in types; evaluation preserves it.
- **Decoder soundness**: `decode s u = Ok v` ⇒ `v` contains no Unknown and satisfies `s`.
- **Consumer purity**: If `g : a -> b` (no `!ffi`) and `decode s u = Ok x : a`, then `g x` runs without `!ffi`.
- **Tag purity**: Adapter tag detection performs no property reads/calls.

#### Acceptance tests (essentials)

- Attempts to add/compare/call/destructure Unknown ⇒ type error.
- Tag-match on Unknown is pure (no `!ffi`); structural destructuring on Unknown is rejected.
- Using `@field?`/`index_opt`/`call_ffi` on `Unknown` requires `!ffi`; callers inherit `!ffi`.
- `decode` builds pure values on success; failures are structured; decoder functions have `!ffi`.
- Pure functions consuming decoded values type-check and run without `!ffi`.
- Unknown inside containers stays Unknown until decoded; no silent unification.

#### Notes

- Start with Node/browser adapters; keep tag set closed and stable.
- Prefer one-shot deep decode at boundaries to keep most code pure.

---

### Implementation Plan (phased)

1. Parser/Lexer

- Ensure `@field?` postfix recognized.
- Keep `|?` as existing operator.

2. Core typing/effects

- Add Unknown intro form: `forget : a -> Unknown` (pure).
- Type `@field?`:
  - Native record: `{ @k a, ... } -> Option a` (pure)
  - Unknown: `Unknown -> Option Unknown !ffi`
- Add `at` function in stdlib types:
  - `Float -> List a -> Option a` (pure)
  - `Float -> Tuple {..} -> Option a` (pure)
  - `Float -> Unknown -> Option Unknown !ffi`
- Add `call_ffi : Schema res -> Unknown -> List Unknown -> Result res (EncodeError | DecodeError) !ffi`.

3. Evaluator/runtime

- Implement adapter registry and pure tag detection (no property reads/calls).
- Implement structural reads for `@field?` on Unknown with `!ffi`.
- Implement `at` over native and Unknown.
- Implement `call_ffi` pipeline: encode args, invoke, decode result.

4. Schema/decoder DSL (stdlib)

- Define `Schema a` and primitives/combinators.
- Implement `decode`, `guard` using `@field?`, `at`, and tag checks.

5. Effects propagation and diagnostics

- Enforce non-erasable `!ffi` at use sites; improve error messages when missing.
- Surface taint/effects in REPL type displays.

6. Tests

- Parser: `@name?` ok.
- Typing: Unknown inert; `@field?`/`at` pure vs `!ffi` on Unknown.
- Evaluator: tag purity; structural ops require `!ffi`.
- Decoders: success/failure cases; no Unknown in outputs.
- `call_ffi`: encode errors, decode errors, happy path.

7. Docs

- Update language reference and README with `@field?`, `at`, `call_ffi`, and schema usage.
