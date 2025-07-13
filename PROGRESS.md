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
├── parser/parser.ts      # Main parser (combinator-based)
├── parser/combinators.ts # Parser combinator library
├── ast.ts               # Abstract syntax tree definitions
├── evaluator.ts         # Interpreter with closure handling
├── typer.ts             # Type inference system
├── cli.ts               # Command-line tools and debugging
└── repl.ts              # Interactive REPL
```

### **Language Syntax Patterns**
- **Functions**: `fn param => body` (curried)
- **Definitions**: `name = expr` or `name = expr : type`
- **Sequences**: `expr1; expr2` (returns rightmost value)
- **Data Structures**: All use commas `[1,2,3]`, `{@a 1, @b 2}`, `{1,2,3}`
- **Type Annotations**: `name = expr : type` or `(expr : type)`

### **Recursion Implementation**
- **Intelligent Detection**: Only recursive definitions use cells (mutable references)
- **Closure-based**: Functions capture environment at creation time
- **Type Integration**: Recursion works seamlessly with type checking
- **Test Coverage**: 21 comprehensive recursion tests

### **Common Development Patterns**
1. **Testing**: `npm test` runs 198 tests (2 effect tests skipped)
2. **Debugging**: `npx ts-node src/cli.ts --eval "code"` for quick testing
3. **REPL**: `npx ts-node src/repl.ts` for interactive development
4. **AST Inspection**: Use CLI tools for debugging parser issues

### **Current State**
- ✅ **Core language complete** with recursion, types, data structures
- ✅ **198 tests passing** with comprehensive coverage
- ✅ **Production-ready** for basic functional programming
- 🚧 **Next**: Type variable unification and effect system refactoring

### **Key Technical Insights**
- **Environment Management**: Shared references for recursion, copies for function calls
- **Type Variables**: Currently not unified (e.g., `t1 -> Int` not resolved to `Int -> Int`)
- **Effects**: Currently embedded in function types, planned separation
- **Mutation**: Only local mutation supported with explicit syntax

### **Troubleshooting Common Issues**

#### **Parser Issues**
- **"Expected IDENTIFIER"**: Check for missing spaces or incorrect tokenization
- **"Unexpected token"**: Verify syntax matches language patterns (commas, semicolons)
- **Debug**: Use `npx ts-node src/cli.ts --tokens "code"` to inspect tokenization

#### **Evaluation Issues**
- **"Undefined variable"**: Check if variable is defined before use, recursion detection
- **"Cannot apply non-function"**: Verify function application syntax and currying
- **Debug**: Use `npx ts-node src/cli.ts --ast "code"` to inspect AST structure

#### **Type System Issues**
- **"Type mismatch"**: Check type annotations and inferred types
- **"Cannot unify"**: Type variables not yet unified to concrete types
- **Debug**: Use REPL `.types` command to inspect type environment

#### **Recursion Issues**
- **"Undefined variable" in recursive function**: Check recursion detection logic
- **Infinite recursion**: Verify base cases and termination conditions
- **Debug**: Use `npx ts-node src/cli.ts --eval "recursive_code"` to test

#### **Mutation Issues**
- **"Cannot mutate non-mutable variable"**: Use `mut` keyword for mutable definitions
- **Unexpected mutation**: Check if variable was accidentally made recursive
- **Debug**: Verify variable is stored as cell vs direct value

### **Development Workflow**
1. **Write test first** in appropriate test file
2. **Implement feature** with proper error handling
3. **Run tests** with `npm test` or specific test file
4. **Debug issues** using CLI tools and REPL
5. **Update documentation** in PROGRESS.md and relevant docs

---

## 🚩 Session Notes (Current Session - Recursion Implementation Complete)
- **Recursion fully implemented and tested** ✅
- **Comprehensive unit tests added** ✅
- **All tests passing** (198 tests, 2 skipped effect tests) ✅
- **Parser, evaluator, typer all working robustly** ✅
- **Type annotation parser fully implemented** ✅
- **Parser combinator library** - very well tested with 46 tests across 15 test suites ✅
- **Type system design refined** - unified `expr : type` syntax, clarified scoping rules
- **Effect system** - identified key insight: expressions should have (Type, Effects) pairs, not types with embedded effects
- **Data structure syntax** - confirmed: lists, records, and tuples use commas as separators

### Just Completed ✅
- **Functional Typer Migration**: Successfully migrated from class-based to functional typer with explicit state threading
- **Let-Polymorphism Implementation**: Fixed generalization and instantiation in functional typer for proper polymorphic function support
- **Enhanced Type Error Messages**: Implemented comprehensive, illuminating type error system with detailed context and helpful suggestions
- **Location-Aware Error Reporting**: Threaded AST location information through unification for accurate error positioning
- **Recursion Implementation**: Fixed function evaluation to properly handle recursive calls
- **Currying Fix**: Implemented proper closure-based currying with environment capture
- **Recursion Detection**: Added intelligent detection of recursive definitions vs regular definitions
- **Comprehensive Testing**: Added 21 recursion tests covering factorial, fibonacci, list operations, and more
- **Mutation Fix**: Fixed mutation system to properly distinguish mutable vs immutable variables
- **Type System Integration**: Recursion works seamlessly with type checking

### Outstanding / Next Steps
- **Complete Functional Typer Implementation**: Add missing expression kinds (pipeline, import, accessor, where, unit, typed) to match class-based typer
- **Implement type variable unification** (so type variables are resolved to concrete types when possible)
- **Refactor effect system** to separate types from effects (expressions have (Type, Effects) pairs)
- **Add expression-level type annotations** `(expr : type)` for complex expressions
- **Add pattern matching and destructuring**
- **Add FFI (foreign function interface) for JS/TS interop**
- **Begin standard library bootstrapping** (move built-ins to Noolang source files)
- **Continue improving error reporting and diagnostics** (enhanced type errors ✅)

### What we accomplished this session
- **Functional Typer Migration**: Successfully migrated core Hindley-Milner type inference to functional architecture with explicit state threading
- **Let-Polymorphism Fix**: Resolved generalization and instantiation issues in functional typer for proper polymorphic function support
- **Enhanced Error System**: Implemented comprehensive type error reporting with location information and helpful suggestions
- **Location Threading**: Added AST location information to unification process for accurate error positioning
- **Environment Management**: Fixed function parameter environment isolation to prevent type variable leakage
- **Debug Output Cleanup**: Removed all debug console.log statements for clean test output
- **Test Suite**: All functional typer tests passing, class-based typer tests still have expected limitations

---

## 🎯 Project Overview
We are writing a new language. Noolang is a whitespace-significant, LLM-friendly programming language with explicit effects and strong type inference.

---

## ✅ Completed Features

### Core Infrastructure
- **Lexer**: Tokenizes whitespace-significant syntax with proper indentation handling
- **Parser**: Combinator-based parser with precedence climbing for expressions
- **AST**: Complete abstract syntax tree with all expression types
- **Evaluator**: Interpreter with built-in functions and proper scoping
- **Typer**: Type inference system with primitive types and function types
- **REPL**: Interactive development environment with comprehensive debugging tools

### Language Features
- **Literals**: Numbers, strings, booleans
- **Variables**: Identifier references
- **Function Definitions**: `fn param => body` syntax
- **Function Applications**: Curried function calls with proper precedence
- **Binary Operators**: Arithmetic (`+`, `-`, `*`, `/`), comparison (`<`, `>`, `<=`, `>=`, `==`, `!=`)
- **Pipeline Operator**: `|>` for function composition
- **If Expressions**: `if condition then expr else expr`
- **Lists**: comma-separated elements `[1, 2, 3]`
- **Records**: comma-separated fields `{ @name "Alice", @age 30 }`
- **Tuples**: comma-separated elements `{1, 2, 3}` (positional fields)
- **Accessors**: `@field` for getting/setting record fields
- **Semicolon Sequencing**: `expr1; expr2` for sequencing expressions
- **Parenthesized Expressions**: `(expr)` for explicit precedence
- **Import System**: File-based imports with record exports
- **Type Annotations**: `name = expr : type` syntax fully supported
- **Recursion**: Full support for recursive functions with proper closure handling
- **Mutation**: Local mutation with `mut` and `mut!` syntax

### Parser Architecture
- **Combinator Library**: Custom parser combinator implementation
- **Precedence Hierarchy**: Proper operator precedence (application > multiplicative > additive > comparison > pipeline)
- **Whitespace Handling**: Respects whitespace-significant design
- **Error Handling**: Clear error messages with location information
- **Type Annotation Support**: Full support for `: type` syntax in definitions

### Testing
- **Parser Tests**: All expression types and edge cases (36/36 passing)
- **Evaluator Tests**: Function evaluation, built-ins, error handling, recursion
- **Typer Tests**: Type inference for all language constructs including recursion
- **REPL Debugging**: Comprehensive debugging commands for development
- **198/198 tests passing** ✅ (2 effect tests skipped)
- There's multiple utilities for debugging parser issues in @cli.ts which you can execute like `npx ts-node src/cli.ts`. See cli.ts for available flags.

## 🔧 Recent Fixes (Latest Session)
- **Recursion Implementation**: Fixed function evaluation with proper closure-based currying
- **Recursion Detection**: Intelligent detection of recursive vs regular definitions
- **Mutation System**: Fixed to properly distinguish mutable vs immutable variables
- **Comprehensive Testing**: Added 21 recursion tests covering all major patterns
- **Type Annotation Parser**: Added `parseDefinitionWithType` to main parser flow
- **Sequence Parsing**: Parser now correctly handles sequences of definitions using explicit semicolons
- **Import System**: Successfully implemented file-based imports with record exports
- **Enhanced REPL**: Implemented Phase 1 debugging system with `.` prefix and parentheses syntax
- **Lambda Expression Parsing**: Fixed `parseLambdaExpression` to use `parseSequenceTermWithIf`
- **If Expression Parsing**: Fixed `parseIfExpression` to use `parseSequenceTerm` for branches
- **Deeply Nested Tuples**: Fixed test expectations to match correct AST structure

## 🚀 Next Steps (Prioritized)

### Phase 1: Type System Enhancement (High Priority)
1. **Complete Functional Typer Implementation**
   - Add missing expression kinds: pipeline, import, accessor, where, unit, typed
   - Migrate all features from class-based typer to functional typer
   - Update CLI and REPL to use functional typer exclusively

2. **Type Variable Unification**
   - Implement unification to resolve `t1 -> Int` to `Int -> Int`
   - Fix type annotation mismatch errors in demo files
   - Enable more precise type inference for polymorphic functions

3. **Effect System Refactoring**
   - Separate types from effects (expressions have (Type, Effects) pairs)
   - Remove thunking workaround
   - Implement proper effect inference and composition

4. **Expression-level Type Annotations**
   - Add support for `(expr : type)` syntax for complex expressions
   - Enable type annotations in function bodies and nested expressions

### Phase 2: Language Expressiveness (Medium Priority)
5. **Pattern Matching & Destructuring**
   - Add `match`/`case` expressions for algebraic data types
   - Implement destructuring in function parameters and let bindings
   - Support for tuple and record pattern matching

6. **Enhanced REPL Debugging System - Phase 2**
   - Add step-by-step debugging commands (`.step`, `.parse-step`, `.lex-step`)
   - Implement type system debugging tools (`.types`, `.type-step`)
   - Add module debugging capabilities (`.imports`, `.import-detail`, `.reload`)

### Phase 3: Ecosystem & Interop (Lower Priority)
7. **Module System & Imports**
   - Expand import capabilities, namespaces, and REPL support for loading modules
   - Enables bootstrapping the standard library in Noolang

8. **Standard Library Bootstrapping**
   - Move all built-in functions (map, filter, reduce, arithmetic, etc.) to Noolang source files
   - Use the module system for loading and testing

9. **FFI (Foreign Function Interface)**
   - Add JavaScript/TypeScript interop capabilities
   - Enable calling JS functions from Noolang and vice versa

10. **Error Reporting & Diagnostics**
    - Improve error messages, add source highlighting, and REPL error recovery
    - Better type error messages with suggestions

---

## 🎉 Major Accomplishments

### ✅ **Core Language Complete**
- **Full recursion support** with proper closure handling and type checking
- **Comprehensive type system** with inference, annotations, and unification foundation
- **Functional typer architecture** with explicit state threading and proper let-polymorphism
- **Robust parser** handling all language constructs with proper precedence
- **Complete evaluator** with built-ins, mutation, and proper scoping
- **198 comprehensive tests** covering all language features

### ✅ **Production-Ready Features**
- **Recursion**: Self-referential functions, deep recursion, list operations
- **Type System**: Inference, annotations, function types, let-polymorphism with proper generalization
- **Data Structures**: Lists, records, tuples with consistent comma syntax
- **Control Flow**: If expressions, sequencing, function application
- **Mutation**: Local mutation with proper immutability guarantees
- **Imports**: File-based module system with record exports
- **Error Reporting**: Enhanced type error messages with location information and helpful suggestions

### ✅ **Developer Experience**
- **REPL**: Interactive development with debugging commands
- **CLI Tools**: AST inspection, token visualization, error diagnostics
- **Comprehensive Testing**: Unit tests for all language constructs
- **TypeScript Integration**: Full type safety throughout codebase

---

*These steps will make Noolang more self-hosting, expressive, and LLM-friendly, and will lay the foundation for a robust ecosystem and advanced features!*

## 🎨 Language Design Principles
- **Whitespace Significant**: Indentation and spacing matter
- **LLM Friendly**: Clear, predictable syntax patterns
- **Explicit Effects**: Effects are tracked in the type system
- **Strong Inference**: Types are inferred where possible
- **Functional**: Immutable data, pure functions by default
- **Composable**: Pipeline operator and function composition
- **Curried Functions**: All functions are curried by default (Haskell-style)
- **File Structure**: Each file is a single statement/expression
- **Semicolon Semantics**: `;` is an expression separator, not a terminator
  - Left expression is evaluated and discarded
  - Right expression is evaluated and returned
  - Enables sequencing while returning only the final result
- **Data Structure Consistency**: All data structures use commas as separators
  - Records: `{ @field1 value1, @field2 value2 }`
  - Lists: `[item1, item2, item3]`
  - Tuples: `{item1, item2, item3}` (positional fields)
- **Program Evaluation**: `evaluateProgram` returns only the final expression result
  - Multiple statements are evaluated in sequence
  - Only the result of the last statement is returned
  - This matches the semicolon semantics where left expressions are discarded

## 📁 Project Structure
```
noolang/
├── src/
│   ├── lexer.ts          # Tokenizer
│   ├── parser/           # Parser implementation
│   │   ├── parser.ts     # Main parser (combinator-based)
│   │   └── combinators.ts # Parser combinator library
│   ├── ast.ts            # Abstract syntax tree
│   ├── evaluator.ts      # Interpreter
│   ├── typer.ts          # Type inference
│   ├── cli.ts            # Command-line interface
│   ├── repl.ts           # Interactive REPL
│   └── format.ts         # Value formatting and output
├── test/                 # Test suites
├── std/                  # Standard library modules
├── examples/             # Example programs
└── docs/                 # Documentation
```

## 🧪 Current Test Status
- **Parser Tests**: ✅ All passing (36/36)
- **Evaluator Tests**: ✅ All passing (including 12 recursion tests)
- **Typer Tests**: ✅ All passing (including 8 recursion tests)
- **Type System Tests**: ✅ All passing (2 effect tests skipped)
- **Total**: 198/198 tests passing ✅

## 🔍 Key Technical Decisions
- **Parser Combinators**: Chosen for readability and maintainability
- **Comma-separated Data Structures**: Consistent syntax across records, lists, and tuples
- **Type Annotations**: `name = expr : type` syntax for explicit type declarations
- **Single Parser**: Consolidated from duplicate implementations
- **TypeScript**: Full type safety throughout the codebase
- **CLI Debugging**: Built-in AST and token inspection for development

## 📦 Module System Design

### Core Philosophy
- **Modules are not special**: Import is just a binding like any other definition
- **No "top-level only" restriction**: Imports can appear anywhere in code
- **Duplicate imports are fine**: Importing the same module multiple times is allowed (idempotent)
- **Type-safe**: Imported values are typed just like any other values
- **Compositional**: Modules can be aliased, re-exported, and composed freely

### Import Syntax
```noolang
# File-relative imports (recommended)
math = import "math_functions"           # Same directory
utils = import "../utils/helpers"        # Parent directory
std = import "../../std/math"            # Multiple parent levels

# Absolute paths (also supported)
config = import "/absolute/path/config"

# Or inline:
result = (import "math_functions").add 2 3
```

### Effects System Integration
- **Import is effectful**: Loading files, parsing, and evaluating are tracked effects
- **Typed effects**: `import "path"` will have type like `FileRead -> Module`
- **Effect composition**: Import effects compose with other effects in the program
- **Explicit tracking**: No "magic" - all effects are visible in the type system

### Implementation Notes
- Import expression: `import "path"` is a regular expression, not special syntax
- **File-relative resolution**: Imports are resolved relative to the importing file's directory
- **Fallback behavior**: When no file context is available, falls back to current working directory
- **Absolute paths**: Full paths starting with `/` are resolved as-is
- Module values: Records/dictionaries of exported names
- Environment isolation: Each import gets its own scope
- Caching: Optional module result caching to avoid re-evaluation
- Type inference: Will infer/check types of imported modules

---
*Last Updated: Current session - Type annotation parser complete, all tests passing, ready for type variable unification* 

## 🎯 Enhanced REPL Debugging System - Phase 1 Complete ✅

### **Successfully Implemented Commands:**

**Basic Commands:**
- `.help` - Show comprehensive help
- `.quit` / `.exit` - Exit REPL

**Environment Commands:**
- `.env` - Show current environment
- `.env-detail` - Show detailed environment with types
- `.env-json` - Show environment as JSON
- `.clear-env` - Clear environment
- `.types` - Show type environment

**Debugging Commands:**
- `.tokens (expr)` - Show tokens for expression
- `.tokens-file file` - Show tokens for file
- `.ast (expr)` - Show AST for expression
- `.ast-file file` - Show AST for file
- `.ast-json (expr)` - Show AST as JSON

### **Key Design Decisions:**
- **Future-Proof**: `.` prefix avoids conflicts with future `:` type annotations
- **Natural Syntax**: Parentheses `(expr)` instead of quotes for expressions
- **Comprehensive**: Covers token inspection, AST visualization, and environment management

### **Benefits Achieved:**
- **Faster Issue Diagnosis**: Quick token and AST inspection
- **Better Error Messages**: Detailed error context and suggestions
- **Interactive Development**: Step-by-step debugging capabilities
- **Future-Proof Design**: No conflicts with type annotations
- **Natural Syntax**: Parentheses feel more natural than quotes

### **Example Usage:**
```bash
noolang> .tokens (result1 = (@add math) 2 3)
# Shows proper tokenization including fixed identifier parsing

noolang> .ast (a = 1; b = 2)
# Shows proper AST structure for sequences

noolang> .ast-file test_import_record.noo
# Shows AST for entire files
```

--- 

## 🛠️ Current Work (Session Context)

### Recently Completed
- **Sequences of Definitions**: ✅ Fixed foundational issue with parsing sequences of definitions
- **Identifier Parsing**: ✅ Fixed lexer to handle identifiers with numbers (e.g., `result1`)
- **Import System**: ✅ Successfully implemented file-based imports with record exports
- **Module Testing**: ✅ Confirmed ability to import files that export functions as records
- **Enhanced REPL Phase 1**: ✅ Implemented comprehensive debugging system with `.` prefix and parentheses syntax
- **Parser Edge Cases**: ✅ Fixed lambda expressions, if expressions in sequences, deeply nested tuples
- **Test Suite**: ✅ All 105 tests now passing

### Key Achievements
- **File-Relative Imports**: ✅ Implemented proper file-relative import resolution
- **Import Record Test**: Successfully imports `math_functions.noo` and uses its functions
- **Sequence Parsing**: `a = 1; b = 2; c = 3` now works correctly
- **Complex Imports**: `math = import "math_functions"; result = (@add math) 2 3` works
- **Full Integration**: Complete test with multiple definitions and function calls works
- **Parser Robustness**: All edge cases handled including complex nested structures
- **CLI Debugging**: Successfully used CLI to diagnose and fix parser issues

### Outstanding Issues
- None - all foundational issues resolved

### Next Steps
1. **Enhanced REPL Phase 2**: Add step-by-step debugging, type system debugging, and module debugging
2. **Module System**: Expand import capabilities and namespaces
3. **Standard Library**: Move built-ins to Noolang source files
4. **Pattern Matching**: Add match/case expressions

---
*Current focus: Enhanced REPL Phase 2 debugging system to add advanced debugging capabilities.* 

## 🔧 Enhanced REPL Debugging System Plan

### Overview
After experiencing the debugging challenges with parser and lexer issues, we need comprehensive debugging tools in the REPL to diagnose similar problems efficiently.

### Phase 1: Core Debugging (High Impact) ✅ COMPLETE

#### Token Inspection Commands
```noolang
.tokens (a = 1; b = 2)     # Show tokens for an expression
.tokens-file file.noo      # Show tokens for a file
```

#### AST Inspection Commands
```noolang
.ast (a = 1; b = 2)        # Show parsed AST for an expression
.ast-file file.noo         # Show parsed AST for a file
.ast-json (expr)           # Show AST as JSON for detailed inspection
```

#### Enhanced Environment Inspection
```noolang
.env-detail               # Show detailed environment with types
.env-json                 # Show environment as JSON
.clear-env                # Clear environment
```

#### Better Error Reporting
```noolang
.error-detail             # Show detailed error information
.error-context            # Show error with surrounding context
.error-suggestions        # Show potential fixes for common errors
```

### Phase 2: Advanced Debugging (Next Priority)

#### Step-by-Step Debugging
```noolang
.step (a = 1; b = 2)       # Step through parsing process
.parse-step (expr)         # Show each parser step
.lex-step (expr)           # Show each lexer step
```

#### Type System Debugging
```noolang
.types (expr)              # Show type inference for expression
.types-file file.noo       # Show types for entire file
.type-step (expr)          # Step through type inference
```

#### Module Debugging
```noolang
.imports                  # Show loaded modules
.import-detail (module)   # Show details of imported module
.reload (module)          # Reload a module
```

### Phase 3: Developer Experience (Future)

#### Interactive Testing
```noolang
.test (expr)              # Test if expression parses/evaluates
.test-file file.noo       # Test entire file
.compare (expr1) (expr2)  # Compare two expressions
```

#### Performance and Memory
```noolang
.profile (expr)            # Profile execution time
.memory                   # Show memory usage
.gc                       # Force garbage collection
```

#### Configuration and Settings
```noolang
.debug-on                 # Enable debug mode
.debug-off                # Disable debug mode
.verbose-on               # Enable verbose output
.verbose-off              # Disable verbose output
.config                   # Show current configuration
```

### Example Usage Scenarios

#### Scenario 1: Parser Issue (like we just solved)
```noolang
noolang> .tokens (result1 = (@add math) 2 3)
Tokens: IDENTIFIER('result1') OPERATOR('=') PUNCTUATION('(') ACCESSOR('add') IDENTIFIER('math') ...
noolang> .ast (result1 = (@add math) 2 3)
AST: Definition with proper identifier parsing
noolang> .error-detail
Error: Identifier parsing issue - 'result1' split into 'result' and '1'
```

#### Scenario 2: Type Inference Issue
```noolang
noolang> .types (fn x => x + 1)
Type: (Int) -> Int
noolang> .type-step (fn x => x + 1)
Step 1: x inferred as Int
Step 2: x + 1 inferred as Int
Step 3: Function type: (Int) -> Int
```

#### Scenario 3: Import Issue
```noolang
noolang> .imports
Loaded modules: math_functions
noolang> .import-detail (math_functions)
Module: math_functions
Exports: { add: Function, multiply: Function, square: Function }
```

### Implementation Priority
1. **Phase 1**: Core debugging commands for immediate impact ✅
2. **Phase 2**: Advanced debugging for complex issues
3. **Phase 3**: Developer experience improvements

### Benefits
- **Faster Issue Diagnosis**: Quick token and AST inspection
- **Better Error Messages**: Detailed error context and suggestions
- **Interactive Development**: Step-by-step debugging capabilities
- **Performance Insights**: Profiling and memory analysis
- **Module Management**: Import tracking and reloading

---
*This debugging system will significantly improve the development experience and make Noolang more accessible for both development and learning.* 

## 🔎 Guidance: Type Checks in the Evaluator and Built-ins

- **Do not rely on JavaScript `typeof` or `Array.isArray` for Noolang type checks.**
  - These only reflect JS runtime types, not Noolang types (e.g., tuple vs. list, record vs. object).
- **For now, use `ast.kind` and AST structure for type checks in AST-native functions and the evaluator.**
  - This is sufficient for distinguishing literals, records, tuples, etc., before the type system is implemented.
- **When the type system is implemented, use the `type` field on AST nodes for all type-based dispatch and validation.**
  - The type checker should annotate AST nodes with their Noolang types.
  - The evaluator and built-ins should trust and use these annotations for type checks.
- **Migration path:**
  1. Finish migrating all built-ins to AST-native pattern, using `ast.kind` for now.
  2. Add type annotations to AST nodes as the type system is developed.
  3. Update the evaluator and built-ins to use `ast.type` for all type checks.

This approach ensures correctness, extensibility, and a smooth transition to a robust type system.

# Things the human is tracking
* I look forward to parametric polymorphism but that's a whole can of worms
* Need to add a FFI of some kind, maybe just to js or TS