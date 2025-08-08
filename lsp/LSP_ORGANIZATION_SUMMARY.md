# LSP Organization Summary (Updated)

## Current Layout

- `lsp/extension/` — VS Code extension (client) and TypeScript LSP server
  - `src/` — Extension client TypeScript
  - `server/src/server.ts` — LSP server implementation
  - `out/` — Compiled extension and server outputs (gitignored)
  - `package.json` — Extension manifest and build scripts
- `lsp/syntaxes/` — Syntax highlighting
- `lsp/language-configuration.json` — Language configuration
- `lsp/install-extension.sh` — Build and package helper
- Test fixtures: `lsp/test-*.noo`, `lsp/simple-test.noo`

## Build

```bash
cd lsp/extension
npm ci
npm run compile
```

## Notes

- The previous Rust LSP has been removed.
- Documentation and scripts referencing cargo or `tower_lsp` are obsolete.
- CI builds the extension and verifies `out/server/server.js` and `out/extension.js` are present.