# Noolang Progress Tracker

## 🎯 Project Overview
We are writing a new language. Noolang is a whitespace-significant, LLM-friendly programming language with explicit effects and strong type inference.

---

## 🆕 Recent Progress (Current Session)
- **Runtime Value Migration**: Migrated all runtime values to a consistent tagged union pattern (numbers, strings, booleans, lists, records, functions, native functions).
- **Evaluator & Built-ins**: Updated all evaluator logic and built-in/native functions to use tagged values and type guards/constructors for type safety and extensibility.
- **Debug File Cleanup**: Removed obsolete debug-*.ts and related cruft files from the codebase.
- **Test Suite**: Removed obsolete AST morphism tests; all tests now pass (87/87).
- **Codebase Health**: The codebase is now cleaner, more type-safe, and easier to extend.

### Summary
The migration to a tagged union runtime is complete. All evaluator and built-in logic now uses a robust, extensible, and type-safe value representation. Debug cruft has been removed, and the test suite is green after cleaning up obsolete tests. The codebase is ready for the next phase of language and tooling improvements.

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
- **Lists**: Semicolon-separated elements `[1; 2; 3]`
- **Records**: Semicolon-separated fields `{ @name "Alice"; @age 30 }`
- **Accessors**: `@field` for getting/setting record fields
- **Semicolon Sequencing**: `expr1; expr2` for sequencing expressions
- **Parenthesized Expressions**: `(expr)` for explicit precedence

### Parser Architecture
- **Combinator Library**: Custom parser combinator implementation
- **Precedence Hierarchy**: Proper operator precedence (application > multiplicative > additive > comparison > pipeline)
- **Whitespace Handling**: Respects whitespace-significant design
- **Error Handling**: Clear error messages with location information
- **Unambiguous Data Structures**: Semicolon-separated syntax eliminates parsing ambiguity

### Testing
- **Parser Tests**: All expression types and edge cases
- **Evaluator Tests**: Function evaluation, built-ins, error handling
- **Typer Tests**: Type inference for all language constructs
- **REPL Debugging**: Comprehensive debugging commands for development
- **56/56 tests passing** ✅

## 🔧 Recent Fixes (Latest Session)
- **Identifier Parsing**: Fixed lexer to correctly parse identifiers containing numbers (e.g., `result1`, `result2`)
- **Lexer Precedence**: Fixed order of token type checking to parse identifiers before numbers
- **Sequence Parsing**: Parser now correctly handles sequences of definitions using explicit semicolons
- **Import System**: Successfully implemented file-based imports with record exports
- **Module Testing**: Confirmed ability to import files that export functions as records
- **Enhanced REPL**: Implemented Phase 1 debugging system with `.` prefix and parentheses syntax

## 🚀 Next Steps (Prioritized)

1. **Enhanced REPL Debugging System - Phase 2**
   - Add step-by-step debugging commands (`.step`, `.parse-step`, `.lex-step`)
   - Implement type system debugging tools (`.types`, `.type-step`)
   - Add module debugging capabilities (`.imports`, `.import-detail`, `.reload`)

2. **Module System & Imports**
   - Expand import capabilities, namespaces, and REPL support for loading modules
   - Enables bootstrapping the standard library in Noolang

3. **Standard Library Bootstrapping**
   - Move all built-in functions (map, filter, reduce, arithmetic, etc.) to Noolang source files
   - Use the module system for loading and testing

4. **Pattern Matching & Destructuring**
   - Add `match`/`case` expressions and destructuring in function parameters

5. **Effects System**
   - Begin explicit effect tracking in the type system
   - Add effectful built-ins and type inference for effects

6. **Error Reporting & Diagnostics**
   - Improve error messages, add source highlighting, and REPL error recovery

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
- **Data Structure Consistency**: All data structures use semicolons as separators
  - Records: `{ @field1 value1; @field2 value2 }`
  - Lists: `[item1; item2; item3]`
  - Tuples: `(item1; item2; item3)` (future)
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
│   └── repl.ts           # Interactive REPL
├── test/                 # Test suites
├── dist/                 # Compiled JavaScript
└── docs/                 # Documentation
```

## 🧪 Current Test Status
- **Parser Tests**: ✅ All passing
- **Evaluator Tests**: ✅ All passing  
- **Typer Tests**: ✅ All passing
- **Total**: 56/56 tests passing

## 🔍 Key Technical Decisions
- **Parser Combinators**: Chosen for readability and maintainability
- **Semicolon-separated Data Structures**: Consistent syntax across records, lists, and future tuples
- **No Commas**: Language doesn't use commas as separators
- **Single Parser**: Consolidated from duplicate implementations
- **TypeScript**: Full type safety throughout the codebase
- **Ambiguity Elimination**: Semicolon separators prevent parsing traps

## 📦 Module System Design

### Core Philosophy
- **Modules are not special**: Import is just a binding like any other definition
- **No "top-level only" restriction**: Imports can appear anywhere in code
- **Duplicate imports are fine**: Importing the same module multiple times is allowed (idempotent)
- **Type-safe**: Imported values are typed just like any other values
- **Compositional**: Modules can be aliased, re-exported, and composed freely

### Import Syntax
```noolang
math = import "std/math"
add = math.add
result = add 2 3

# Or inline:
result = (import "std/math").add 2 3
```

### Effects System Integration
- **Import is effectful**: Loading files, parsing, and evaluating are tracked effects
- **Typed effects**: `import "path"` will have type like `FileRead -> Module`
- **Effect composition**: Import effects compose with other effects in the program
- **Explicit tracking**: No "magic" - all effects are visible in the type system

### Implementation Notes
- Import expression: `import "path"` is a regular expression, not special syntax
- Module values: Likely records/dictionaries of exported names
- Environment isolation: Each import gets its own scope
- Caching: Optional module result caching to avoid re-evaluation
- Type inference: Will infer/check types of imported modules

---
*Last Updated: Current session - All tests passing, sequences of definitions working, import system functional, Phase 1 debugging complete*

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

### Key Achievements
- **Import Record Test**: Successfully imports `math_functions.noo` and uses its functions
- **Sequence Parsing**: `a = 1; b = 2; c = 3` now works correctly
- **Complex Imports**: `math = import "math_functions"; result = (@add math) 2 3` works
- **Full Integration**: Complete test with multiple definitions and function calls works

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
1. **Phase 1**: Core debugging commands for immediate impact
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
* Need rigorous unit tests for parser library
* I look forward to parametric polymorphism but that's a whole can of worms
* Need to add a FFI of some kind, maybe just to js or TS