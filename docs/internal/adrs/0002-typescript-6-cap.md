# 2. Cap `typescript` at 6.0.3 until one of three triggers fires

Date: 2026-08-01

## Status

Accepted

## Context

TS7 dropped the programmatic compiler API; `typescript-eslint` refuses to
run under it. PR #169 capped `typescript` at `^6.0.3` — newest version that
both `tsc` and `typescript-eslint` accept — as a stopgap.

Microsoft's documented fix is `@typescript/typescript6`, a TS6-API compat
shim, installed alongside real TS7 via npm dependency aliasing (real `tsc`
under one local name, `require('typescript')` resolving to the shim under
another, so `typescript-eslint` needs no code change). Investigated in PR
#173: the manifest works correctly under plain `npm install`, but bun 1.2.19
mis-resolves the shim's own transitive `npm:` alias, silently collapsing it
onto itself (`require('typescript')` ends up empty — no `createProgram`,
shim non-functional). Confirmed via `bun.lock` inspection, a cache-cleared
reinstall, and a bun `overrides` attempt; none fixed it. Full repro and
evidence: `docs/internal/docs-wip/TS7_ALIAS_BUN_BUG.md`.

## Decision

Stay on `typescript: ^6.0.3` until any of:

1. **Bun fixes nested `npm:` alias resolution.** Re-run the exact repro in
   `TS7_ALIAS_BUN_BUG.md` against the new bun version first — don't assume
   it's fixed from a changelog entry alone, and don't assume bun's behavior
   elsewhere is unchanged just because this one bug is gone.
2. **`typescript-eslint` ships native TS7 support**, removing the need for
   the shim (and the alias, and this ADR) entirely. Re-check by attempting a
   plain `typescript: ^7.x` bump with no alias.
3. **The project moves off bun** for installs (npm/pnpm/yarn), where the
   alias manifest is already confirmed working.

At whichever trigger fires, re-verify the full checklist from PR #169/#173
(`bun run typecheck`, `bun run typecheck:test`, `AGENT=1 bun test`,
`node validate_examples.js`, `bun run lint`) rather than trusting that a
fixed root cause implies a clean upgrade.

## Consequences

- `tsc` itself stays on TS6, forgoing TS7's compiler speedup, until a
  trigger fires.
- The investigation is preserved in docs-wip so the alias approach isn't
  blindly re-attempted; this ADR is the pointer to it.
