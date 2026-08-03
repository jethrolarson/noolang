# TS7 + typescript-eslint via npm dependency aliasing: doesn't work under bun

Investigated 2026-08-01, following up on PR #169's `typescript` cap at `^6.0.3`
(root cause: `typescript-eslint` refuses to run under TS7's removed
programmatic compiler API).

## The proposed fix

Microsoft's TS7 announcement documents exactly this problem and ships
`@typescript/typescript6`, a compat package re-exporting the TS6 API, meant
to be installed alongside real TS7 via npm dependency aliasing:

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```

Idea: `tsc` (real, fast, TS7) lives under the local name `@typescript/native`;
anything that does `require('typescript')` (i.e. typescript-eslint) resolves
to the TS6-API shim instead. No code changes needed in typescript-eslint.

## Verified: the concept itself is sound

Confirmed in a scratch npm install with this exact manifest:

- `node_modules/.bin/tsc` → `@typescript/native/bin/tsc`, reports `Version
  7.0.2` (real TS7's own `bin` field is `{"tsc": "./bin/tsc"}`; the shim's is
  `{"tsc6": "./bin/tsc6"}`, so there's no bin collision).
- `require('typescript')` under npm returns 2248 keys including a working
  `createProgram` — i.e. the shim is fully functional there.

## Bun cannot install this manifest correctly — do not adopt

`@typescript/typescript6` itself depends on `"@typescript/old": "npm:
typescript@^6"` (it needs the *real* TS6 implementation under an internal
alias; its own `lib/typescript.js` is just `module.exports =
require("@typescript/old")`).

Under `bun install` (1.2.19), this nested alias resolves wrong: bun's
lockfile shows `@typescript/old` resolving to `@typescript/typescript6@6.0.2`
— itself — instead of the real `typescript@^6` package:

```
"@typescript/old": ["@typescript/typescript6@6.0.2", "", { "dependencies": { "@typescript/old": "npm:typescript@^6" }, ... }]
```

The root-level override of the literal name `typescript` bleeds into
transitive resolution of that same literal name elsewhere in the graph, which
npm scopes correctly and bun does not. Result: `require('typescript')` in the
installed tree returns an empty object (0 keys, no `createProgram`) — the
shim is non-functional, so typescript-eslint would still be broken, just
silently instead of loudly.

Tried and ruled out:
- Clearing `~/.bun/install/cache` and reinstalling — same result.
- Adding a bun `"overrides"` entry pointing `@typescript/old` directly at
  real `typescript@6.0.3` — ignored; identical broken resolution.

This is a bun-specific bug in nested/transitive `npm:` alias resolution, not
a manifest mistake — the identical `package.json` installs and works
correctly under plain `npm install`.

## Decision

Keep `typescript` capped at `^6.0.3` (unchanged from PR #169). Re-attempt
only if a future bun release fixes transitive alias resolution, or if the
project moves off bun for installs.
