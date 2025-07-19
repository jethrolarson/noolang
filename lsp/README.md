# Noolang Language Server Protocol (LSP)

A Rust implementation of the Language Server Protocol for Noolang, providing intelligent code editing features in VS Code and other LSP-compatible editors.

## Overview

This LSP server is a proof-of-concept for Rust development in the Noolang project. It provides semantic language features beyond basic syntax highlighting, including:

- **IntelliSense** - Auto-completion for functions, variables, and types
- **Go to Definition** - Navigate to function/variable definitions
- **Hover Information** - Show type information and documentation
- **Error Checking** - Real-time type and syntax error reporting
- **Symbol Search** - Find all references and rename symbols

## Architecture

```
lsp/
├── src/
│   ├── main.rs      # LSP server entry point
│   ├── lib.rs       # Library exports
│   ├── server.rs    # Main LSP implementation
│   ├── parser.rs    # Noolang parser (ported from TypeScript)
│   └── types.rs     # LSP-specific data structures
├── Cargo.toml       # Rust dependencies
└── README.md        # This file
```

## Development Plan

### Phase 1: Basic LSP Infrastructure ✅

- [x] Set up tower-lsp framework
- [x] Basic server initialization
- [x] Placeholder implementations for core LSP methods

### Phase 2: TypeScript Integration (In Progress)

- [ ] Call TypeScript interpreter for type checking
- [ ] Parse TypeScript output for LSP features
- [ ] Implement basic symbol extraction
- [ ] Add error handling and recovery

### Phase 3: Semantic Features

- [ ] **Completion Provider** - Auto-complete based on scope
- [ ] **Hover Provider** - Show type information on hover
- [ ] **Definition Provider** - Go to definition functionality
- [ ] **Diagnostics** - Real-time error reporting

### Phase 4: Advanced Features

- [ ] **Symbol Search** - Find all references
- [ ] **Refactoring** - Rename symbols across files
- [ ] **Code Actions** - Quick fixes and refactoring
- [ ] **Workspace Symbols** - Search across entire workspace

### Phase 5: Integration

- [ ] **VS Code Extension** - Package LSP with VS Code extension
- [ ] **Performance Optimization** - Ensure sub-100ms response times
- [ ] **Testing** - Comprehensive test suite
- [ ] **Documentation** - User and developer documentation

## Getting Started

### Prerequisites

- Rust 1.70+ and Cargo
- VS Code or other LSP-compatible editor

### Development Setup

```bash
# Build the LSP server
cd lsp
cargo build

# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run
```

### Testing with VS Code

1. Build the LSP: `cargo build --release`
2. Configure VS Code to use the LSP server
3. Open a `.noo` file and test features

## Integration with TypeScript Interpreter

The LSP will leverage the existing TypeScript interpreter:

- **LSP (Rust)**: Provides IDE features (completion, navigation, error checking)
- **Interpreter (TypeScript)**: Handles parsing, type checking, and execution
- **Communication**: LSP calls TypeScript CLI for language analysis

This approach allows for:

- **Rust learning** - Focus on LSP without rewriting language logic
- **Quick validation** - Test if Rust provides value for this use case
- **Risk mitigation** - Keep working TypeScript implementation as source of truth
- **Performance comparison** - Benchmark Rust LSP vs potential TypeScript LSP

## Future Considerations

### Potential Full Migration

If the LSP proves successful, consider:

- **Porting the interpreter** to Rust for better performance
- **Unified codebase** - Single Rust implementation for both LSP and execution
- **Better tooling** - Leverage Rust's ecosystem for development tools

### Performance Goals

- **Completion**: < 50ms response time
- **Go to Definition**: < 100ms response time
- **Error Checking**: < 200ms for typical files
- **Memory Usage**: < 100MB for large workspaces

## Contributing

1. **Start with Phase 2** - Focus on getting the parser working
2. **Test incrementally** - Each feature should be testable independently
3. **Benchmark regularly** - Compare performance with TypeScript version
4. **Document decisions** - Keep track of design choices and trade-offs

## Resources

- [tower-lsp Documentation](https://docs.rs/tower-lsp/)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [Noolang TypeScript Implementation](../src/) - Reference for parser logic
