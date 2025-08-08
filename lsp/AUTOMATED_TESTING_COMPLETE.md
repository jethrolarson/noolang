# Noolang LSP Testing Notes (Updated)

The LSP server is now implemented in TypeScript (Node) under `lsp/extension/server` and ships with the VS Code extension. Testing focuses on:

- Building the extension and server: `cd lsp/extension && npm ci && npm run compile`
- Manual verification in VS Code by opening `.noo` files
- Type system behavior is covered by existing tests in the main repo

Legacy Rust testing content has been removed.