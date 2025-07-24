# Noolang Language Architecture

## Overview

Noolang is a functional, expression-based programming language with strong static typing, effect tracking, and constraint-based polymorphism. The architecture follows a traditional compiler pipeline with modern features like Hindley-Milner type inference with constraints, algebraic data types, and an effects system.

## Architecture Components

### 1. CLI Entry Point (`src/cli.ts`)

The CLI serves as the main entry point and orchestrates the entire compilation pipeline:

**Key Responsibilities:**
- Command-line argument parsing and dispatch
- File I/O operations 
- Performance benchmarking
- Error reporting and formatting
- Integration of all pipeline stages

**Pipeline Flow:**
```
Source Code → Lexer → Parser → Type Checker → Evaluator → Output
```

**Supported Operations:**
- File execution: `noo file.noo`
- Expression evaluation: `noo --eval "expression"`
- Debug modes: `--tokens`, `--ast`, `--types`, `--types-detailed`
- Symbol type inspection: `--symbol-type file.noo symbol`
- REPL mode: `noo` (no arguments)

### 2. Lexical Analysis (`src/lexer/`)

**File:** `lexer/lexer.ts`

The lexer transforms source code into a stream of tokens for parsing.

**Token Types:**
- `IDENTIFIER` - Variable and function names
- `NUMBER` - Numeric literals  
- `STRING` - String literals
- `BOOLEAN` - Boolean literals (True/False)
- `OPERATOR` - Mathematical and logical operators
- `PUNCTUATION` - Structural symbols (parentheses, brackets, etc.)
- `KEYWORD` - Reserved language keywords
- `ACCESSOR` - Record field access syntax (`@field`)
- `COMMENT` - Code comments (starting with `#`)
- `EOF` - End of file marker

**Key Features:**
- Position tracking for error reporting
- Whitespace and comment handling
- Support for complex operators (`|>`, `|?`, `$`, etc.)
- String escaping and numeric parsing

### 3. Syntax Analysis (`src/parser/`)

**Files:** `parser/parser.ts`, `parser/combinators.ts`

The parser uses a combinator-based approach to build an Abstract Syntax Tree (AST) from tokens.

**Architecture:**
- **Combinator-based parsing** - Modular, composable parsing functions
- **Recursive descent** - Top-down parsing with precedence handling
- **Error recovery** - Meaningful error messages with position information

**Expression Types (AST Nodes):**
- `LiteralExpression` - Numbers, strings, booleans, lists
- `VariableExpression` - Variable references
- `FunctionExpression` - Lambda functions (`fn x => body`)
- `ApplicationExpression` - Function calls
- `PipelineExpression` - Pipeline operations (`|>`, `|`, `|?`)
- `BinaryExpression` - Binary operators (`+`, `-`, `==`, etc.)
- `IfExpression` - Conditional expressions
- `DefinitionExpression` - Variable definitions
- `MutableDefinitionExpression` - Mutable variable definitions (`mut`)
- `MutationExpression` - Variable mutation (`mut!`)
- `RecordExpression` - Record literals (`{ @field value }`)
- `TupleExpression` - Tuple literals (`{1, 2, 3}`)
- `AccessorExpression` - Field access (`@field record`)
- `MatchExpression` - Pattern matching
- `TypeDefinitionExpression` - ADT definitions
- `ConstraintDefinitionExpression` - Trait definitions
- `ImplementDefinitionExpression` - Trait implementations

### 4. Type System (`src/typer/`)

The type system is the most complex component, implementing Hindley-Milner type inference extended with effects, constraints, and algebraic data types.

#### 4.1 Core Types (`types.ts`)

**Type Representation:**
```typescript
type Type = 
  | PrimitiveType     // Int, String, Bool
  | FunctionType      // T1 -> T2 (with effects)
  | VariableType      // Type variables (a, b, c)
  | ListType          // List T
  | TupleType         // {T1, T2, T3}
  | RecordType        // {field1: T1, field2: T2}
  | UnionType         // T1 | T2
  | VariantType       // Constructor applications
  | ADTType           // Algebraic data type definitions
  | UnitType          // () - the unit type
  | UnknownType       // ? - inference placeholder
```

**Type Environment:**
- **TypeScheme** - Polymorphic types with quantified variables
- **TypeEnvironment** - Maps identifiers to type schemes
- **ConstraintRegistry** - Tracks trait definitions and implementations
- **ADTRegistry** - Tracks algebraic data type definitions

#### 4.2 Type Inference Engine

**Main Modules:**
- `index.ts` - Main entry point and orchestration
- `type-inference.ts` - Core inference algorithms
- `constraint-solver.ts` - Constraint-based unification
- `function-application.ts` - Function call type checking
- `pattern-matching.ts` - Pattern match type checking

**Inference Process:**
1. **Constraint Generation** - Generate type constraints from expressions
2. **Constraint Solving** - Unify constraints to find most general types
3. **Effect Tracking** - Track and propagate computational effects
4. **Substitution** - Apply type variable assignments
5. **Generalization** - Create polymorphic type schemes

#### 4.3 Constraint System (`constraint-*.ts`)

**Purpose:** Support for trait-like constraints and polymorphism

**Components:**
- **Constraint Generation** - Extract constraints from expressions
- **Constraint Resolution** - Resolve constraints to concrete implementations
- **Unification** - Advanced unification with constraint handling
- **Validation** - Ensure constraint consistency

**Constraint Types:**
- `is` - Type membership constraints (`a is Collection`)
- `hasField` - Field presence constraints (`a has field "length" : Int`)
- `implements` - Trait implementation (`a implements Show`)
- `custom` - User-defined constraints

#### 4.4 Effects System (`effects.ts`, throughout typer)

**Tracked Effects:**
- `log` - Logging operations
- `read` - File reading
- `write` - File writing
- `state` - Mutable state access
- `time` - Time-dependent operations
- `rand` - Random number generation
- `ffi` - Foreign function interface
- `async` - Asynchronous operations

**Effect Tracking:**
- Effects are part of function types
- Effect inference through the type system
- Effect polymorphism and constraints

### 5. Runtime Evaluation (`src/evaluator/`)

**File:** `evaluator/evaluator.ts`

The evaluator implements a tree-walking interpreter for the typed AST.

**Value Types:**
```typescript
type Value = 
  | { tag: 'number'; value: number }
  | { tag: 'string'; value: string }
  | { tag: 'tuple'; values: Value[] }
  | { tag: 'list'; values: Value[] }
  | { tag: 'record'; fields: Record<string, Value> }
  | { tag: 'function'; fn: (...args: Value[]) => Value }
  | { tag: 'native'; name: string; fn: unknown }
  | { tag: 'constructor'; name: string; args: Value[] }
  | { tag: 'unit' }
```

**Key Features:**
- **Environment Management** - Lexical scoping with environment chains
- **Closure Implementation** - Functions capture their lexical environment
- **Pattern Matching** - Runtime pattern match evaluation
- **Mutable State** - Cell-based mutable variable implementation
- **Built-in Functions** - Extensive library of primitive operations
- **ADT Support** - Constructor creation and pattern matching
- **Effect Execution** - Runtime effect handling

**Built-in Operations:**
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- List operations: `map`, `filter`, `reduce`, `length`, `head`, `tail`
- String operations: `concat`, `toString`, `length`
- I/O operations: `log`, `read_file`, `write_file`

### 6. REPL (`src/repl.ts`)

**Interactive Development Environment:**
- **Persistent State** - Type environment and evaluator state persist across inputs
- **Command System** - Special REPL commands (`:load`, `:type`, `:clear`, etc.)
- **Error Handling** - Graceful error recovery without crashing
- **Debugging Support** - Type inspection and AST viewing
- **Autocomplete** - Tab completion for identifiers (future enhancement)

**REPL Commands:**
- `.load <file>` - Load and execute a file
- `.type <expr>` - Show type of expression
- `.clear` - Clear REPL state
- `.help` - Show help information

### 7. Standard Library (`stdlib.noo`)

**Core Algebraic Data Types:**
- `Bool = True | False` - Boolean type
- `Option a = Some a | None` - Optional values
- `Result a b = Ok a | Err b` - Error handling

**List Operations:**
- `head` - Safe first element extraction
- `join` - Join with separator
- `map`, `filter`, `reduce` - Higher-order functions

**Utility Functions:**
- `id` - Identity function
- `compose` - Function composition
- Boolean operations: `not`, `bool_and`, `bool_or`
- Option utilities: `option_get_or`, `option_map`
- Result utilities: `result_get_or`, `result_map`

### 8. Supporting Modules

#### 8.1 AST Definitions (`src/ast.ts`)
- Complete type definitions for all AST nodes
- Location tracking for error reporting
- Type annotation support for decorated AST

#### 8.2 Error Handling (`src/errors.ts`)
- Structured error types
- Position-aware error reporting
- Error formatting and display

#### 8.3 Formatting (`src/format.ts`)
- Pretty-printing for values
- Type string generation
- REPL output formatting

#### 8.4 Colors (`src/colors.ts`)
- Terminal color support
- Syntax highlighting for REPL
- Error message colorization

## Data Flow

### 1. Compilation Pipeline
```
Source Code (String)
    ↓ Lexer
Token Stream (Token[])
    ↓ Parser  
AST (Program)
    ↓ Type Checker
Decorated AST + Type State
    ↓ Evaluator
Final Value
```

### 2. Type Inference Flow
```
Expression
    ↓ Constraint Generation
Type Constraints
    ↓ Constraint Solving
Type Substitutions
    ↓ Substitution Application
Concrete Types
    ↓ Effect Resolution
Typed Expression + Effects
```

### 3. REPL Flow
```
User Input
    ↓ Command Check
REPL Command | Expression
    ↓ Pipeline | ↓ Compilation Pipeline
Command Result | Typed Value
    ↓ State Update
Updated REPL State
    ↓ Display
Formatted Output
```

## Key Design Patterns

### 1. Functional Architecture
- Immutable data structures throughout
- Pure functions with explicit effect tracking
- State threading through monadic patterns

### 2. Visitor Pattern
- Type inference uses visitor pattern for expression traversal
- Evaluator uses visitor pattern for execution
- Consistent pattern across compilation phases

### 3. Environment Chain
- Lexical scoping through environment chains
- Both type environment and value environment
- Closure capture through environment references

### 4. Constraint-Based Typing
- Modern constraint generation + solving approach
- Separates constraint generation from resolution
- Supports advanced type system features

### 5. Effect Polymorphism
- Effects as first-class type system concepts
- Effect inference and propagation
- Effect constraints and polymorphism

## Extension Points

### 1. New Expression Types
1. Add AST node to `ast.ts`
2. Add parser support in `parser.ts`
3. Add type inference in appropriate typer module
4. Add evaluation in `evaluator.ts`

### 2. New Built-in Functions
1. Add type signature to `builtins.ts`
2. Add implementation to evaluator
3. Update standard library if needed

### 3. New Effects
1. Add effect to `Effect` type in `ast.ts`
2. Update effect tracking in type system
3. Add runtime support in evaluator

### 4. New Type System Features
1. Extend constraint system in `constraints.ts`
2. Update constraint solver
3. Add inference rules
4. Update unification algorithm

This architecture provides a solid foundation for a modern functional programming language with advanced type system features while maintaining clarity and extensibility.