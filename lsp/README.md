# Noolang VS Code extension and language server

`lsp/extension/` is the sole VS Code extension package. Its `package.json` owns the extension metadata, build, protocol-test, and packaging commands. The extension contains the VS Code client, TextMate grammar, and TypeScript language server.

## Prerequisites

- Node.js 20 or newer and npm
- [Bun](https://bun.sh/) for the protocol tests and for analyzing a Noolang source checkout
- VS Code 1.74 or newer for installation and interactive testing

The language server invokes Noolang's CLI. When the opened workspace is a Noolang source checkout it uses `src/cli.ts` with Bun; otherwise it looks for `dist/cli.js` and runs it with Node. The extension package does not bundle the Noolang interpreter.

## Build and test

From the repository root:

```bash
bun install --frozen-lockfile
bun run build
npm --prefix lsp/extension ci
npm --prefix lsp/extension run compile
npm --prefix lsp/extension test
```

The tests under `lsp/extension/test/` send real protocol messages through an in-memory transport to the production server handlers. See [`extension/test/README.md`](extension/test/README.md) for the harness design.

`extension/test/harness/TestServer.ts` is intentionally retained as a compatibility re-export for external tests. New tests should import `LSPServerHarness` instead.

## Package and install

Create a VSIX from the extension manifest:

```bash
npm --prefix lsp/extension run package
```

This produces `lsp/extension/noolang-lsp-<version>.vsix`. Generated VSIX files are ignored by Git. CI compiles and tests the protocol server before packaging the same manifest, then uploads the VSIX as the `noolang-lsp-vsix` workflow artifact. Download that artifact from the relevant GitHub Actions run rather than using a binary from the repository.

To install a local package when the VS Code CLI is available:

```bash
code --install-extension lsp/extension/noolang-lsp-<version>.vsix
```

Open the Noolang repository as the workspace and then open a `.noo` file. The extension activates for the `noolang` language. Use **Developer: Show Running Extensions** and the **Noolang Language Server** output channel to diagnose activation.

## Current protocol surface

The server currently advertises and handles:

- document synchronization and diagnostics
- completion and hover
- go to definition and references within the current document
- document symbols
- the infer-type-annotation code action

Protocol tests are the maintained automated interface. For an interactive change, also launch the extension from VS Code or install the freshly generated VSIX and exercise the affected feature against a Noolang checkout.
