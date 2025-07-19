# Noolang Progress Tracker

## Notes from dev
* Generally speaking, if the next steps are obvious and not dangerous, just do it.

## 🧭 Quick Orientation Guide (For Future Sessions)

### **Project Overview**
Noolang is a **whitespace-significant, LLM-friendly programming language** with explicit effects and strong type inference. It's written in TypeScript with a functional, combinator-based architecture.

### **Key Architecture Decisions**
- **Parser Combinators**: Custom implementation in `src/parser/combinators.ts` for readability
- **Closure-based Evaluation**: Functions capture environments properly for recursion
- **Type Inference**: Hindley-Milner style with unification foundation
- **Immutable by Default**: Mutation requires explicit `mut`/`mut!` syntax
- **Curried Functions**: All functions are curried (Haskell-style)

### **Critical Files to Know**
```
src/
├── lexer.ts              # Tokenizer (whitespace-significant)
├── parser/parser.ts      # Main parser (combinator-based, optimized)
├── parser/combinators.ts # Parser combinator library
├── ast.ts               # Abstract syntax tree definitions
├── evaluator.ts         # Interpreter with closure handling
├── typer/               # Type system (functional Hindley-Milner)
│   ├── index.ts          # Main type system exports
│   ├── expression-dispatcher.ts # Routes expressions to type handlers
│   ├── type-inference.ts # Core type inference for expressions
│   ├── unify.ts          # Type unification algorithm (optimized)
│   ├── constraints.ts    # Type constraint system
│   ├── substitute.ts     # Type substitution (with caching)
│   ├── type-operations.ts # Type utilities and stdlib loading
│   ├── function-application.ts # Function and pipeline typing
│   ├── pattern-matching.ts # ADT pattern matching types
│   ├── decoration.ts     # AST decoration with types
│   ├── helpers.ts        # Type utilities and comparisons
│   ├── type-errors.ts    # Error reporting and formatting
│   └── types.ts          # Type system data structures
├── cli.ts               # Command-line tools and debugging
└── repl.ts              # Interactive REPL
```

### **Language Syntax Patterns**
- **Functions**: `fn param => body` (curried)
- **Definitions**: `name = expr` or `name = expr : type`
- **Sequences**: `expr1; expr2` (returns rightmost value)
- **Data Structures**: All use commas `[1,2,3]`, `{@a 1, @b 2}`, `{1,2,3}`
- **Type Annotations**: `name = expr : type` or `(expr : type)`

### **Common Development Patterns**
1. **Testing**: `npm test` runs 316 tests
2. **Performance**: `npm run benchmark` for performance testing
3. **REPL**: `npm run dev` for interactive development
4. **CLI Debugging**: See README.md for comprehensive CLI debugging tools

### **Current State**
- ✅ **Core language complete** with recursion, types, data structures, ADTs
- ✅ **All tests passing** (316/316 tests)
- ✅ **Performance optimized** (30% improvement with benchmarking system)
- ✅ **Effect system complete** with full validation and propagation
- ✅ **Production-ready** for functional programming with explicit effects

---

## 🚩 Current Session Status
- **Effect System Phase 1**: ✅ Complete - Effect parsing syntax fully implemented
- **Effect System Phase 2**: ✅ Complete - Separated effects architecture with (Type, Effects) pairs
- **Effect System Phase 3**: ✅ Complete - Effect validation and propagation implemented
- **Parser**: ✅ Supports `!effect` syntax for function types (e.g., `Int -> Int !read !log`)
- **Type System**: ✅ Effects stored as `Set<Effect>` with proper propagation through all expressions
- **Built-in Functions**: ✅ Comprehensive set of effectful functions (read/write, logging, random, state mutation)
- **Testing**: ✅ Comprehensive test suites (Phase 2: 31/31, Phase 3: 40/40 tests passing)
- **Effect Validation**: ✅ Effect propagation through function composition, data structures, and control flow
- **Effect Taxonomy**: ✅ Updated to granular effects: `!log`, `!read`, `!write`, `!state`, `!time`, `!rand`, `!ffi`, `!async`
- **Test Suite Updates**: ✅ All legacy tests updated to use current effect names (316/316 tests passing)

## ✅ Core Features Complete
- **Parser**: Combinator-based with performance optimizations
- **Evaluator**: Closure-based with recursion and mutation support
- **Type System**: Hindley-Milner with constraints and ADTs
- **Type Annotations**: Both definition-level (`name = expr : type`) and expression-level (`(expr : type)`)
- **Type Variable Unification**: Concrete type resolution working (shows `(Int) -> Int` not `t1 -> t2`)
- **ADTs**: Pattern matching, Option/Result types, custom constructors
- **REPL**: Interactive development with debugging commands
- **Performance**: Optimized with benchmarking infrastructure

## 📊 Performance & Testing
- **Performance**: 30% overall improvement with maintained correctness
- **Benchmarking**: `npm run benchmark` - tracks performance over time
- **Tests**: 316/316 passing (parser, evaluator, typer, ADTs, constraints, effects)
- **Coverage**: All language features thoroughly tested including complete effect system

## 🔧 Key Technical Insights
- **Environment Management**: Shared references for recursion, copies for function calls
- **Parser Optimization**: Token-based dispatch instead of backtracking choice
- **Constraint System**: Structural comparison instead of JSON serialization
- **Type Variables**: Proper unification with constraint propagation
- **Effects**: Complete 3-phase implementation with granular effect tracking and validation

## 🚀 Next Steps (Prioritized)
1. **Record Type Annotations**: Support `{@name String, @age Number}` syntax
2. **Constraint Annotations**: Add `given` syntax for explicit constraint declarations  
3. **VSCode Integration**: Language Server Protocol (LSP) for intellisense and hover types
4. **Show Constraints**: Add `Show` constraint to `print` function for type safety before Rust migration
5. **FFI**: JavaScript/TypeScript interop capabilities
6. **Standard Library**: Move built-ins to Noolang source files
7. **Effect Documentation**: Add comprehensive effect system examples and best practices

## 🎯 Language Design Principles
- **Whitespace Significant**: Indentation and spacing matter
- **LLM Friendly**: Clear, predictable syntax patterns
- **Explicit Effects**: Effects tracked in type system
- **Strong Inference**: Types inferred where possible
- **Functional**: Immutable data, pure functions by default
- **Composable**: Pipeline operator and function composition
- **File Structure**: Each file is a single statement/expression
- **Data Consistency**: All structures use commas as separators

## 📁 Project Structure
```
noolang/
├── src/                  # Core implementation
├── test/                 # Test suites (316 tests)
├── benchmarks/           # Performance benchmarks
├── benchmark-results/    # Historical performance data
├── std/                  # Standard library modules
├── examples/             # Example programs
└── docs/                 # Documentation
```

# Things the human is tracking
* Type and parser errors should show the source code line and the line above and below
* Need to add a FFI of some kind, maybe just to js or TS
* Need to add support for Float or make Int into float and not have int
* `new Lexer("a = 1; b = 2; a + b;");`???
* Imports aren't being inferred correctly
* What if we have a way for the llm to ask what the type at a particular point in the program is? maybe with a `^` character? Similar to how users can hover over code with the mouse. or maybe just supporting LSP will do that?
* Need module paths. Having to load everything via relative paths is troublesome
* we're using both camelCase and snake. Everything should be snake.
* Need to audit built-in effects
* print should be : a -> a given a is Show (maybe log too, or can we just leave that with dumb encoding inferred in host language?)