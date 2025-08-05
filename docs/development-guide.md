# Development Guide

> Guide for contributing to Noolang development, understanding the architecture, and building from source.

## Source Code References
- **Main Source**: [`src/`](../src/) - Core language implementation
- **Tests**: [`test/`](../test/) - Comprehensive test suite
- **Scripts**: [`scripts/`](../scripts/) - Development and testing utilities
- **Configuration**: [`package.json`](../package.json) - Build scripts and dependencies

## Getting Started with Development

### Prerequisites

- **Node.js** (18+ recommended)
- **Bun** (for fast builds and testing)
- **TypeScript** (for type checking)

### Setting Up Development Environment

```bash
# Clone the repository
git clone <repository-url>
cd noolang

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development REPL
npm start
```

## Architecture Overview

### Core Components

The Noolang implementation follows a traditional interpreter architecture:

```
Input → Lexer → Parser → Type Checker → Evaluator → Output
```

#### 1. Lexer ([`src/lexer/`](../src/lexer/))

**File**: [`src/lexer/lexer.ts`](../src/lexer/lexer.ts)

Converts raw text into tokens:

```typescript
// Token types defined in lexer.ts:3-13
type TokenType = 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'BOOLEAN' 
               | 'OPERATOR' | 'PUNCTUATION' | 'KEYWORD' | 'COMMENT' 
               | 'ACCESSOR' | 'EOF'

// Main lexer class
export class Lexer {
  tokenize(): Token[]  // Converts input string to tokens
}
```

**Key Features**:
- Multi-character operators (`|>`, `<=`, `=>`)
- Keyword recognition (47 keywords supported)
- Comments and whitespace handling
- Position tracking for error reporting

**Tests**: [`src/lexer/__tests__/lexer.test.ts`](../src/lexer/__tests__/lexer.test.ts)

#### 2. Parser ([`src/parser/`](../src/parser/))

**Files**: 
- [`src/parser/parser.ts`](../src/parser/) - Main parser logic
- [`src/parser/combinators.ts`](../src/parser/) - Parser combinator utilities

Converts tokens into Abstract Syntax Tree (AST):

```typescript
// AST node types defined in src/ast.ts
type Expression = LiteralExpression | IdentifierExpression 
                | FunctionExpression | ApplicationExpression
                | BinaryExpression | ConditionalExpression
                | RecordExpression | ListExpression | ...
```

**Key Features**:
- Recursive descent parsing
- Operator precedence handling
- Error recovery and reporting
- Support for all language constructs

**Tests**: [`src/parser/__tests__/`](../src/parser/__tests__/)

#### 3. Type System ([`src/typer/`](../src/typer/))

**Files**:
- [`src/typer/index.ts`](../src/typer/) - Main type checker
- [`src/typer/types.ts`](../src/typer/) - Type definitions
- [`src/typer/builtins.ts`](../src/typer/) - Built-in type implementations
- [`src/typer/helpers.ts`](../src/typer/) - Utility functions

Implements Hindley-Milner type inference:

```typescript
export interface TypeState {
  environment: Map<string, TypeScheme>
  substitution: Substitution
  traitRegistry: TraitRegistry
  nextVarId: number
}

// Main type checking function
export function typeExpression(expr: Expression, state: TypeState): TypeResult
```

**Key Features**:
- Complete type inference
- Constraint/trait system
- Effect tracking
- Polymorphism support

**Tests**: [`src/typer/__tests__/`](../src/typer/__tests__/) and [`test/type-system/`](../test/type-system/)

#### 4. Evaluator ([`src/evaluator/`](../src/evaluator/))

**Files**:
- [`src/evaluator/evaluator.ts`](../src/evaluator/) - Main evaluation engine
- [`src/evaluator/evaluator-utils.ts`](../src/evaluator/) - Utility functions

Executes the typed AST:

```typescript
export class Evaluator {
  evaluate(expression: Expression): Value
  getEnvironment(): Map<string, Value>
}
```

**Key Features**:
- Functional evaluation model
- Closure support
- Built-in function implementations
- Error handling

**Tests**: [`src/evaluator/__tests__/`](../src/evaluator/__tests__/) and [`test/features/`](../test/features/)

#### 5. REPL & CLI ([`src/repl.ts`](../src/repl.ts), [`src/cli.ts`](../src/cli.ts))

Interactive development tools:

```typescript
// REPL core - testable without readline
export class REPLCore {
  processInput(input: string): { success: boolean; output?: string; error?: string }
}

// CLI with extensive debugging options
function main() // Handles all CLI commands
```

**Features**:
- Interactive evaluation
- Debugging commands
- File processing
- Type inspection

### Supporting Files

#### Utilities
- [`src/format.ts`](../src/format.ts) - Value formatting and pretty-printing
- [`src/colors.ts`](../src/colors.ts) - Terminal color output
- [`src/errors.ts`](../src/errors.ts) - Error types and handling
- [`src/effects.ts`](../src/effects.ts) - Effect system implementation

#### AST Definition
- [`src/ast.ts`](../src/ast.ts) - Complete AST node definitions, type annotations

## Development Workflows

### Available Scripts

From [`package.json:6-30`](../package.json#L6-L30):

#### Building
```bash
npm run build           # Compile TypeScript to JavaScript
npm run typecheck       # Check types without building
```

#### Testing
```bash
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode  
npm run test:bail      # Stop on first test failure
npm run test:all       # Run all test suites (including LSP)
```

#### Development
```bash
npm start              # Run CLI/REPL
npm start:debug        # Run with debugger attached
npm start:debug-brk    # Run with debugger breakpoint
```

#### Code Quality
```bash
npm run lint           # Check code style
npm run lint:fix       # Fix linting issues automatically
```

#### Performance
```bash
npm run benchmark      # Run performance benchmarks
npm run benchmark:repl # Benchmark REPL performance
```

### Testing Strategy

#### Unit Tests
- **Lexer tests**: Token generation correctness
- **Parser tests**: AST construction accuracy
- **Type tests**: Type inference correctness
- **Evaluator tests**: Runtime behavior validation

#### Integration Tests
- **Feature tests**: Complete language features
- **Example tests**: All example files must work
- **REPL tests**: Interactive functionality

#### Test Organization
```
test/
├── type-system/          # Type system specific tests
├── features/             # Language feature tests
├── language-features/    # Core language functionality
└── */                   # Feature-specific test directories
```

### Adding New Features

#### 1. Language Features

To add a new language construct:

1. **Update Lexer**: Add new tokens if needed
2. **Update Parser**: Add parsing rules
3. **Update AST**: Add new AST node types
4. **Update Type Checker**: Add type rules
5. **Update Evaluator**: Add evaluation logic
6. **Add Tests**: Comprehensive test coverage

Example workflow for adding `loop` construct:

```bash
# 1. Add tests first (TDD approach)
touch test/features/loops/basic-loops.test.ts

# 2. Update lexer for 'loop' keyword
# Edit src/lexer/lexer.ts: add 'loop' to keywords array

# 3. Update AST
# Edit src/ast.ts: add LoopExpression interface

# 4. Update parser  
# Edit src/parser/parser.ts: add parseLoop function

# 5. Update type checker
# Edit src/typer/index.ts: add loop typing rules

# 6. Update evaluator
# Edit src/evaluator/evaluator.ts: add loop evaluation

# 7. Test and iterate
npm test test/features/loops/
```

#### 2. Built-in Functions

To add new built-in functions:

1. **Update Standard Library**: Add to [`stdlib.noo`](../stdlib.noo)
2. **Update Builtins**: Add to [`src/typer/builtins.ts`](../src/typer/builtins.ts)
3. **Add Implementation**: Add to evaluator if needed
4. **Add Tests**: Test the new functionality

#### 3. Type System Features

For type system enhancements:

1. **Update Type Definitions**: [`src/typer/types.ts`](../src/typer/types.ts)
2. **Update Type Checker**: [`src/typer/index.ts`](../src/typer/)
3. **Add Type Tests**: [`test/type-system/`](../test/type-system/)
4. **Update Documentation**: Type system docs

### Debugging Development Issues

#### Common Development Tasks

**Debug Parser Issues**:
```bash
npm start --tokens "problematic syntax"
npm start --ast "problematic syntax"
```

**Debug Type Issues**:
```bash
npm start --types "expression with type issues"
npm start --types-detailed "complex expression"
```

**Debug Runtime Issues**:
```bash
npm start --eval "expression"
# Or use REPL with .error-detail
```

**Performance Investigation**:
```bash
npm run benchmark
time npm start --types-file large_file.noo
```

#### Development REPL

Use the REPL for rapid development:

```bash
npm start
```

```
noo> # Test new language features interactively
noo> newFeature = "test syntax"
noo> .tokens (newFeature)
noo> .ast (newFeature)
noo> .types (newFeature)
```

### Code Style Guidelines

#### TypeScript Conventions
- Use explicit types for public APIs
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for immutable data
- Follow existing naming conventions

#### Testing Conventions
- One test file per source file when possible
- Use descriptive test names
- Test both success and error cases
- Include edge cases and boundary conditions

#### Git Workflow
- Create feature branches for new features
- Use descriptive commit messages
- Run tests before committing
- Keep commits focused and atomic

### Performance Considerations

#### Benchmarking
```bash
# Run built-in benchmarks
npm run benchmark

# Profile specific operations
time npm start examples/large_example.noo
time npm start --types-file examples/complex_types.noo
```

#### Memory Usage
- Use the development tools to monitor memory
- Check for memory leaks in long-running processes
- Profile type checker memory usage

#### Optimization Areas
- **Parser**: Reduce allocations in hot paths
- **Type Checker**: Optimize constraint resolution
- **Evaluator**: Minimize runtime overhead

### Release Process

#### Pre-release Checklist
1. All tests pass: `npm run test:all`
2. Type checking passes: `npm run typecheck`
3. Linting passes: `npm run lint`
4. Benchmarks are stable: `npm run benchmark`
5. Documentation is updated
6. Examples work correctly

#### Version Management
- Follow semantic versioning
- Update version in `package.json`
- Tag releases in git
- Update changelog

## Contributing Guidelines

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Add tests**
5. **Ensure all tests pass**
6. **Submit a pull request**

### Code Review Process

- All changes require review
- Tests must pass
- Documentation must be updated
- Performance impact should be considered

### Areas Needing Contribution

- **Pattern matching implementation**
- **Module system enhancement**
- **VS Code language server**
- **Performance optimizations**
- **Documentation improvements**
- **Error message enhancement**

### Getting Help

- Check existing tests for examples
- Use the REPL for experimentation
- Examine similar features for patterns
- Ask questions in issues or discussions

## Advanced Development Topics

### Language Server Development

The VS Code integration is work-in-progress:

```bash
# Build the language server
npm run test:lsp-build

# Test the language server
npm run test:lsp
```

### Benchmarking and Performance

Monitor performance regression:

```bash
# Run benchmarks
npm run benchmark

# Profile memory usage
npm start --inspect examples/large_file.noo
```

### Cross-platform Considerations

Noolang runs on:
- Linux (primary development platform)
- macOS
- Windows (via WSL recommended)

Test on multiple platforms before major releases.

## Next Steps

- **Start contributing**: Pick an issue or feature to work on
- **Learn the codebase**: Read through the source files systematically  
- **Run examples**: Execute all examples to understand language capabilities
- **Write tests**: Contribute test cases for better coverage