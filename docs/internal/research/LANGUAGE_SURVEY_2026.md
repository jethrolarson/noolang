# Survey: agentlanguages.dev catalogue vs. Noolang

Source: https://agentlanguages.dev/#catalogue (July 2026 snapshot), all 38
entries. Site groups them into three camps by hypothesis: **Syntactic**
(shape/tokens), **Verification** (proof/contracts), **Orchestration**
(workflow/effects-as-coordination), plus hybrids/early-stage. Verification
camp (10 languages) and AILANG/NanoLang/Vera specifically were checked
against primary READMEs, not just catalogue summaries — two of those three
summaries overstate the mechanism (noted inline). Everything else is
catalogue-detail-page depth.

Noolang doesn't fit cleanly in any camp — closest to a general-purpose typed
functional language with an effect system, which most of the catalogue
treats as infrastructure rather than the main bet. Most projects here are
betting the *syntax* or the *proof obligations* are the lever; Noolang bet on
*inference + effects + ADTs* being enough.

Noolang's position: **mandatory where undeclared leakage is dangerous,
inferred everywhere legibility is the bigger risk.** Effects are the one
explicit-and-enforced zone; everything else (types) stays inferred by
design.

## Verification camp

| Language | Maturity | Mechanism |
|---|---|---|
| MoonBit | 2,115+ stars, shipping since 2023, 4 backends. Most mature project in the catalogue. | Semantics-aware token sampler: type-checker prunes ill-typed continuations during generation |
| Vera | 300+ stars, 3,400+ tests/96% coverage | Mandatory `requires`/`ensures`/`effects`, Z3-discharged; variables replaced by De Bruijn slot refs. Own README admits the Z3-guided tier is spec'd but unshipped |
| AILANG | 110 releases, 2,958 commits, 33-task benchmark vs. 8 frontier models | Row-polymorphic effects, 5 categories; `--caps IO` flag. README frames this as "declarative, not restrictive" — no enforcement/denial described despite catalogue page claiming otherwise |
| NanoLang | v3.3.7, self-hosting, 193 Coq theorems/0 axioms | Mandatory `shadow` test block per function — but README says the compiler "warns loudly" and does not fail the build on absence, contradicting the project's own "I refuse to compile" marketing |
| Aver | 7 WASM games shipped | Prose intent + effect list + verify-block per function; pure blocks export to Lean4/Dafny theorems |
| Intent | 45 commits/5 stars | `intent` blocks reference contract paths; dangling reference is a compile error; Z3 + runtime-assertion floor |
| Vow | self-hosted, byte-identical bootstrap | Contracts discharged by ESBMC bounded model checking — concrete counterexamples over full soundness |
| Prove | v1.3.1, active | Refinement types (`Integer:[16 Unsigned] where 1..65535`) checked at compile time; anti-AI-training license |
| BHC/hx | single contributor, pre-production | Not a new language — argues Haskell's type system is already the answer and the real gap is GHC/Cabal/GHCup toolchain friction |
| Mog | 1,146+ compiler tests | Scripts declare `requires http, log;`; runtime refuses unregistered calls — real shipped effect denial, scoped to an embedded host-script model |

Maturity spans ~3 orders of magnitude (MoonBit vs. Intent) — treat any
"the verification camp does X" claim as tied to one specific project's
maturity level, not the camp as a whole. Discharge mechanism varies (SMT,
theorem-prover export, bounded model checking, refinement types), and all
four required substantial standalone infrastructure — not a weekend feature.

## Syntactic and orchestration camps

Syntactic (Axis, Codong, Laze, Magpie, NERD, Sever, X07, B-IR, Lume, Mog,
LLMLang): bets that shrinking/reshaping surface syntax is the lever.
Maturity mostly thin — several explicit thought-experiments or single-drop
repos days old. No evidence Noolang's bottleneck is token shape; the
stdlib/module gaps in `docs/internal/docs-wip/LANGUAGE_WEAKNESSES.md` are the measured
problem. Not adopting.

Orchestration (Boruna, Fabro, Lumen, Marsha, Pel, Plasm, Quasar): "how does
an agent safely drive external systems across a session" — different
problem from Noolang's current scope as a language + interpreter, not a
runtime. Maturity spread is real (Fabro: 1,221 stars, 392k lines, shipping;
Marsha: dead since 2023; Pel/Quasar: papers, no implementation). Not
adopting now.

Hybrid/unclassified (Tacit, Codex, Plumbing, Koru, Spec, Valea): mostly
extreme or research-stage bets that don't bear on Noolang's current scope.

Two ideas from these camps are relevant despite the camp-level "no":

- **Structured diagnostics** — not really a syntactic-camp idea, it cuts
  across every camp. Zero (Vercel Labs, 3.3k stars), X07, Lume, Codong, and
  B-IR's Loom independently converged on the same fix: stable per-diagnostic
  error codes plus machine-consumable JSON, so an agent pattern-matches a
  code instead of parsing prose. See recommendations below.
- **Lumen's `@deterministic true`** statically rejects nondeterministic
  calls (`uuid()`, `timestamp()`) at compile time — the enforced version of
  a rule CLAUDE.md already states as convention ("keep nondeterminism out of
  pure functions, pass it in").
- **Tacit's typed `Hole` nodes** — malformed code reduces to a typed hole
  with structured diagnostics instead of failing parse, so tooling keeps
  operating on incomplete programs. Directly relevant — see recommendation 7.

## Noolang's type/effect system

Effects are inferred bottom-up from a function's body (no annotation
required); an annotation may over-declare but a type error results if it
omits a performed effect. Verified against the actual typechecker, not just
docs:

```
$ bun src/cli.ts -e 'bad = fn x => print x : String -> {} !read; bad "ok"'
TypeError: Type annotation omits effect !write performed by the expression

$ bun src/cli.ts -e 'g = fn x => print x; h = fn x => g x : String -> {}; h "ok"'
TypeError: Type annotation omits effect !write performed by the expression
```

Second case is the one that matters: `h` doesn't call `print` directly, it
calls `g` which does — and annotating `h` without `!write` still fails to
typecheck. Effects propagate through composition and are enforced at the
caller, not just at the function that performs the effect directly. A
caller that doesn't already carry an effect in its own (inferred or
annotated) type cannot silently absorb a callee that newly performs it —
allowlist-by-declaration, already shipped. AILANG's `--caps` and Mog's
`requires` are a different model (prohibition/deny-list); Noolang and Vera
both went the allowlist route instead.

Beyond effects, the static type system enforces more than exhaustiveness and
`Option`/`Result`: a constraint system (`Show`, `Eq`, `Ord`, `Functor`,
`Monad`, `Add`, user-defined traits via `implement`) that propagates through
function composition and is checked at every call site; ADT definitions that
reject redefinition and duplicate names; record patterns that type-error on
naming a field the record doesn't have. Comparable in kind to what the
verification camp's lighter members (Intent's contract-path resolution,
Mog's flat-operator disambiguation) reach for via bespoke mechanisms —
Noolang gets a similar amount of "illegal states rejected at compile time"
from one general Hindley-Milner-plus-constraints core, without a separate
contract DSL.

## Does the type system deliver on the verification camp's premise?

Vera's framing — "the model doesn't need to be right, it needs to be
checkable" — is the sharpest statement of what Noolang's type/effect system
is for. It doesn't yet reliably deliver that.

`docs/internal/docs-wip/GENERALIZATION_BUG.md` documents a shipped unsoundness:
`generalize` computed free type variables against the unsubstituted
environment, so a function parameter's type variable could be wrongly
quantified. Concretely, this silently accepted a wrong type —
`fn x y => (result = x + y; result)` inferred as `a -> a -> b` (severed from
`Add`) instead of `a -> a -> a given a implements Add`. Fixing it separately
uncovered a case where the typer and evaluator disagreed about a value's
actual shape: `Monad Option`'s `bind` had an auto-wrap arm the typer treated
as returning `Option Float`, while the evaluator returned a bare `Float` at
runtime. The document names this "a live instance of the 'green and wrong'
hazard." Two other docs (`CONSTRAINT_STORE_DESIGN.md`,
`POINT_FREE_MATCH_PLAN.md`) independently cite the same named hazard as an
open, standing risk, and CLAUDE.md carries it as a permanent warning, not a
closed issue.

So Vera's line describes Noolang's intent, not yet its guarantee — worth
noting Vera's own README admits an unshipped verification tier, so even the
sharpest statement of this goal in the catalogue hasn't fully shipped it
either.

## Recommendations

1. **Don't chase syntactic-camp ideas.** Unmeasured problem (token shape) vs.
   measured one (stdlib/module gaps). Revisit only with evidence generation
   failures cluster on syntax/ambiguity.
2. **Add stable per-diagnostic error codes to `src/errors.ts`.** Five
   independent projects converged on this fix. `NoolangError` already has
   the right shape (`type`, `message`, `context`, `suggestion`,
   `errorToJSON`) — `type` is one of 5 broad categories, not a stable
   identifier per distinct diagnostic an agent could pattern-match on or
   anchor a fix-hint lookup to. Cheapest, best-precedented idea here: no new
   subsystem, extends code already in the repo.
3. **Effect capability denial: not needed.** Noolang already enforces
   allowlist-by-declaration through effect inference plus the
   must-not-omit annotation rule — a caller cannot silently inherit an
   effect it doesn't already carry. Prohibition/deny-list framing (AILANG's
   `--caps`, Mog's `requires`) is a different, deliberately unadopted model.
4. **Shadow-test enforcement: prototype as a warn-only lint, not a compile
   gate.** NanoLang's own shipped behavior is a lint despite its marketing
   claiming a gate — a warn-only shadow-coverage check is low-risk (doesn't
   break exploratory/REPL use), gets real usage data, and a hard gate can
   follow if the lint proves valuable.
5. **Full contract/SMT layer: not now.** Vera/Intent/Aver/Vow each built
   nontrivial standalone infrastructure (Z3, ESBMC, Lean4/Dafny export) for
   compile-time contracts. Noolang's exhaustiveness checking and
   `Option`-returning safe division are already a cheaper partial version of
   the same guarantee — extend that pattern (more operations return
   `Option`/`Result` instead of trusting a precondition) before considering
   a general contract DSL. Matches BHC/hx's challenge: the type system may
   already be enough, lever is where it's applied.
6. **State the type/effect system's goal explicitly, as a goal.** "Wrong
   code should fail loud, not run wrong" is the reason for the investment
   and isn't written down anywhere. Not yet an achieved guarantee — see
   type-soundness section above.
7. **Parser/LSP fail-on-first-error: highest-priority item here.** Noolang
   currently fails on the first error rather than collecting diagnostics
   across a file — exactly the cost Tacit's typed-`Hole`-node approach
   exists to avoid. A single typo blocks feedback on everything else in the
   file, worse for an agent iterating than for a human reading
   top-to-bottom. Known problem, known agent-facing cost, cheap to verify.
8. **Literate-doc `# =>` comments are unverified, not checked.**
   `validate_examples.js` runs whole-file docs via `bun start` and README
   blocks per-block, and both only assert the process exits 0 — neither
   parses the 37 `# =>` annotations in README.md or diffs them against
   actual output. They're trusted comments, not executable spec, despite
   reading like the latter. Cheapest path to a real executable-spec layer:
   a doctest-style runner that asserts `# =>` output against real execution,
   collecting failures per file rather than failing fast (same shape as
   recommendation 7). Two orthogonal knobs would be needed if pursued: a
   **verified** flag per block (opt into the assertion) and a
   **block-isolation** flag (whether bindings/shadowing carry across blocks
   in a file) — the latter is a deliberate, scoped exception to Noolang's
   default no-shadowing rule for pedagogical reasons and should be
   documented as such if it ships, rather than accumulate as an
   undocumented special case.

## Open questions

- Where do Noolang's actual generation failures cluster today — syntax,
  type errors, missing stdlib, or wrong-but-typechecking logic? Most
  consequential unanswered question; determines which recommendation above
  is worth acting on first.
- Does a warn-only shadow-coverage lint get used, or ignored? Needs a scope
  decision (all functions? exported only? opt-in per file?) before it's a
  real proposal, and a follow-up check on actual usage before considering a
  hard gate.
- Do we want any enforced-at-compile-time contract beyond what the existing
  constraint/effect system already gives — i.e. a genuine
  refinement/precondition layer — or is the current core the intended
  ceiling? Leaning YAGNI/different-design-philosophy (would've built a Lisp,
  not an ML-family language, for that route) but not ruled out permanently.
- Should `GENERALIZATION_BUG.md`-class bugs (typer/evaluator disagreement,
  wrongly-accepted types) get a standing regression category — e.g. a
  property-test pass specifically hunting "typechecks but runtime value
  doesn't match the type" — instead of relying on hand-chasing skipped tests
  to surface the next one?
