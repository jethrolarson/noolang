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
- **Structural ops**: The only structural reads/calls are:
  - `@field? : Unknown -> Option Unknown` (pure; effect depends on provenance)
  - `at : Float -> (List a | Unknown) -> Option a` (pure on native lists; effect depends on provenance when input is `Unknown`)
  - `call_ffi : Schema res -> Unknown -> List Unknown -> Result res (EncodeError | DecodeError) !ffi`
  - **!ffi is non-erasable at use sites**: Any function that uses `call_ffi` must declare `!ffi`. Callers inherit this requirement `!ffi` and must also declare `!ffi`.
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

- **Introduction**: `ffi ...` and `forget x` produce Unknown values with provenance (may be ffi-tainted).
- **Refinement is pure**: Tag matches/checked casts are pure and never clear taint.
- **Effects depend on provenance**: Property/index access on Unknown is pure unless it crosses a foreign boundary via an adapter; only such boundary crossings require `!ffi`. Foreign function calls via `call_ffi` always require `!ffi`.
- **Typed manifests do not erase !ffi**: Declarations remove Unknown but must retain declared effects. Only vetted intrinsics may omit `!ffi`.
- **forget is pure**: `forget : a -> Unknown` introduces Unknown without `!ffi`. Elimination/structure rules remain identical to FFI-origin Unknown.

#### Minimal operational surface

- **Unknown ops**: `@field?`, `at`, `call_ffi` (only `call_ffi` always requires `!ffi`; `@field?` and `at` remain pure unless an adapter crosses FFI).
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

1. Parser/Lexer (status)

- `@field?` postfix recognized. (DONE)
- `|?` operator supported. (DONE)

2. Core typing/effects (status)

- Unknown intro form: `forget : a -> Unknown` (pure). (PLANNED)
- `@field?` typing:
  - Native record: `{ @k a, ... } -> Option a` (pure) (DONE)
  - Unknown: `Unknown -> Option Unknown !ffi` (PLANNED)
- `at` function types:
  - `Float -> List a -> Option a` (pure) (PLANNED)
  - `Float -> Tuple {..} -> Option a` (pure) (PLANNED)
  - `Float -> Unknown -> Option Unknown !ffi` (PLANNED)
- `call_ffi : Schema res -> Unknown -> List Unknown -> Result res (EncodeError | DecodeError) !ffi`. (PLANNED)

3. Evaluator/runtime (status)

- Adapter registry and pure tag detection (no property reads/calls). (PLANNED)
- Structural reads for `@field?` on Unknown with `!ffi`. (PLANNED)
- `@field?` on native records returns Some/None. (DONE)
- `at` over native and Unknown. (PLANNED)
- `call_ffi` pipeline: encode args, invoke, decode result. (PLANNED)

4. Schema/decoder DSL (stdlib) (status)

- Define `Schema a` and primitives/combinators. (PLANNED)
- Implement `decode`, `guard` using `@field?`, `at`, and tag checks. (PLANNED)

5. Effects propagation and diagnostics (status)

- Enforce non-erasable `!ffi` at use sites; improve error messages when missing. (PLANNED)
- Surface taint/effects in REPL type displays. (PLANNED)

6. Tests (status)

- Parser: `@name?` ok. (DONE)
- Typing: Unknown inert; `@field?`/`at` pure vs `!ffi` on Unknown. (PARTIAL: native `@field?` DONE)
- Evaluator: tag purity; structural ops require `!ffi`. (PLANNED)
- Decoders: success/failure cases; no Unknown in outputs. (PLANNED)
- `call_ffi`: encode errors, decode errors, happy path. (PLANNED)

7. Docs (status)

- Update language reference and README with `@field?`, `at`, `call_ffi`, and schema usage. (PLANNED)
