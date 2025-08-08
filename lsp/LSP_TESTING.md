# Testing Noolang LSP in VSCode (TypeScript)

## Quick Start

1. Build the extension and server:
   ```bash
   cd lsp/extension
   npm ci
   npm run compile
   ```
2. Open the workspace in VSCode and open any `.noo` file. The LSP activates automatically.

## Manual Testing
- Hover over variables to see type information
- Trigger completions (Ctrl+Space)
- Check diagnostics for errors
- Use F12 (Go to Definition), Shift+F12 (Find References)

## Debugging
- Add logging to `lsp/extension/server/src/server.ts`
- Rebuild with `npm run compile`
- View Output → “Noolang Language Server” in VS Code

## Configuration
The extension enables the server by default via `noolang.enableLanguageServer`.

## Troubleshooting
- Ensure compiled outputs exist:
  - `lsp/extension/out/extension.js`
  - `lsp/extension/out/server/server.js`
- Reinstall dependencies and rebuild if needed:
  ```bash
  cd lsp/extension && rm -rf node_modules && npm ci && npm run compile
  ```

## Resources
- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver (Node) Documentation](https://www.npmjs.com/package/vscode-languageserver)
- [VS Code Language Server Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
