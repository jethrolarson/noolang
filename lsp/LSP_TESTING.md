# Note
# The Rust LSP has been replaced by a TypeScript LSP server embedded in the VS Code extension.
# The cargo-based instructions below are legacy. Use these instead:
#
# Build and test the TS LSP server:
#   cd lsp/extension && npm install && npm run compile
# Open the workspace in VS Code and a .noo file to activate the server.

# Testing Noolang LSP in VSCode

This guide explains how to test the Language Server Protocol (LSP) implementation for Noolang in VSCode.

## Quick Start

1. **Build and setup everything:**

   ```bash
   ./test-lsp.sh
   ```

2. **Open in VSCode:**
   - Open this workspace in VSCode
   - Open `test-lsp.noo` file
   - The LSP should activate automatically

## Manual Setup

### 1. Build the LSP Server

```bash
cd lsp
cargo build --release
cd ..
```

### 2. Install Extension Dependencies

```bash
cd extension
npm install
npm run compile
cd ..
```

### 3. Test the LSP

```bash
cd lsp
cargo test
cargo run --bin test_lsp
cd ..
```

## VSCode Integration

### Automatic Activation

The LSP will automatically activate when you:

- Open any `.noo` file
- The extension is installed and enabled

### Manual Testing

1. **Open a .noo file** - The LSP should start automatically
2. **Check Output panel** - Look for "Noolang Language Server" output
3. **Test features:**
   - Hover over variables to see type information
   - Try autocompletion (Ctrl+Space)
   - Look for error squiggles

### Debugging the LSP

1. **Set breakpoints** in `lsp/src/server.rs`
2. **Press F5** to start debugging
3. **Open a .noo file** to trigger the LSP
4. **Step through code** as the LSP processes requests

## Configuration

### VSCode Settings

The LSP can be configured in `.vscode/settings.json`:

```json
{
	"noolang.languageServerPath": "./lsp/target/release/noolang-lsp",
	"noolang.enableLanguageServer": true
}
```

### Environment Variables

For debugging, set:

```bash
export RUST_LOG=debug
```

## Current Features

### ✅ Implemented

- Basic LSP infrastructure
- Server initialization
- File watching for .noo files
- VSCode extension integration

### 🚧 In Progress

- Type checking integration
- Completion provider
- Hover information
- Error diagnostics

### 📋 Planned

- Go to definition
- Find all references
- Symbol search
- Code actions

## Troubleshooting

### LSP Not Starting

1. **Check binary exists:**

   ```bash
   ls -la lsp/target/release/noolang-lsp
   ```

2. **Check VSCode output:**

   - View → Output → Select "Noolang Language Server"

3. **Check extension:**
   - Extensions panel → Search "noolang"
   - Ensure it's enabled

### Build Errors

1. **Rust toolchain:**

   ```bash
   rustc --version
   cargo --version
   ```

2. **Dependencies:**
   ```bash
   cd lsp && cargo clean && cargo build
   ```

### Extension Errors

1. **TypeScript compilation:**

   ```bash
   cd extension && npm run compile
   ```

2. **Dependencies:**
   ```bash
   cd extension && rm -rf node_modules && npm install
   ```

## Development

### Adding New LSP Features

1. **Implement in Rust** (`lsp/src/server.rs`)
2. **Add tests** (`lsp/src/server.rs` or separate test files)
3. **Update VSCode extension** if needed (`extension/src/extension.ts`)

### Testing New Features

1. **Unit tests:**

   ```bash
   cd lsp && cargo test
   ```

2. **Integration tests:**

   ```bash
   cd lsp && cargo run --bin test_lsp
   ```

3. **Manual testing:**
   - Build and test in VSCode
   - Check for expected behavior

## Performance

### Benchmarks

- **Startup time:** < 1 second
- **Completion response:** < 100ms
- **Error checking:** < 200ms
- **Memory usage:** < 50MB

### Optimization

- Use `--release` builds for production
- Profile with `cargo flamegraph`
- Monitor memory usage with `cargo install cargo-expand`

## Resources

- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver (Node) Documentation](https://www.npmjs.com/package/vscode-languageserver)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [TypeScript LSP Examples](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
