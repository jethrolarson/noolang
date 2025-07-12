# Noolang

An expression-based, LLM-friendly programming language designed for linear, declarative code with explicit effects and strong type inference.

## Features

- **Whitespace-significant syntax** (like Python, but more rigorous)
- **Expression-based** - everything is an expression
- **Strong type inference** with support for primitive types and function types
- **Functional programming** idioms and patterns
- **Pipeline operator** (`|>`) for function composition
- **Records and accessors** for structured data
- **Built-in primitives**: Int, String, Bool, List, Record
- **REPL** for interactive development with comprehensive debugging tools
- **Unambiguous syntax** - semicolon-separated data structures prevent parsing traps

## Installation

```bash
npm install
npm run build
```

## Usage

### REPL

Start the interactive REPL:

```bash
npm run dev
```

Or run the compiled version:

```bash
npm start
```

#### REPL Debugging Commands

The REPL includes comprehensive debugging tools:

```bash
# Basic commands
.help                    # Show help
.quit                    # Exit REPL

# Environment inspection
.env                     # Show current environment
.env-detail              # Show detailed environment with types
.env-json                # Show environment as JSON
.clear-env               # Clear environment
.types                   # Show type environment

# Debugging commands
.tokens (expr)           # Show tokens for expression
.tokens-file file.noo    # Show tokens for file
.ast (expr)              # Show AST for expression
.ast-file file.noo       # Show AST for file
.ast-json (expr)         # Show AST as JSON
```

**Note**: Commands use `.` prefix and parentheses `(expr)` for expressions to avoid conflicts with future type annotations.

### Examples

```noolang
# Function definition
add = fn x y => x + y

# Function application
add 2 3

# Pipeline operator
[1, 2, 3] |> head

# Conditional expressions
if true then 1 else 2

# Records
user = { @name "Alice", @age 30 }

# Accessors
(@name user)

# Local bindings (using function definitions)
localAdd = fn x y => x + y;
localAdd 1 2

# List operations
[1, 2, 3] |> tail |> head
```

## Language Syntax

### Program Structure

**Files are single statements**: Each Noolang file contains exactly one top-level expression or statement.

**Semicolon (`;`) is an expression separator, not a terminator**:
- Left side expression is evaluated and discarded
- Right side expression is evaluated and returned
- This allows for sequencing operations while only returning the final result
- **Program Evaluation**: When evaluating a program with multiple statements, only the result of the final statement is returned

```noolang
# This evaluates to 15 (the result of the right side)
x = 10; x + 5

# This evaluates to [8, 10, 12] (the result of map)
print "hello"; map fn x => x * 2 [4, 5, 6]
```

### Literals

```noolang
42          # Integer
"hello"     # String
true        # Boolean
[1, 2, 3]   # List (comma-separated)
{ @name "Alice", @age 30 }  # Record (comma-separated fields)
```

### Function Definitions

```noolang
# Simple function
add = fn x y => x + y

# Function with multiple parameters
multiply = fn a b c => a * b * c
```

### Function Application

```noolang
# Direct application
add 2 3

# Nested application
add (multiply 2 3) 4
```

### Pipeline Operator

```noolang
# Chain functions
[1, 2, 3] |> head |> add 5
```

### Conditional Expressions

```noolang
if condition then value1 else value2
```

### Records and Accessors

```noolang
# Record creation
user = { @name "Alice", @age 30, @city "NYC" }

# Accessor usage (accessors are functions)
(@name user)        # Returns "Alice"
(@age user)         # Returns 30

# Nested accessors
(@city user)        # Returns "NYC"

# Accessors can be composed
getName = @name;
getName user        # Same as (@name user)
```

### Local Bindings

Local bindings are created using function definitions:

```noolang
localAdd = fn x y => x + y;
localAdd 1 2
```

**Note**: The semicolon after the definition is an expression separator. The definition is evaluated (creating the binding), then discarded, and the function application is evaluated and returned.

### Data Structure Syntax

Noolang uses commas as separators for all data structures:

```noolang
# Lists - comma separated
[1, 2, 3]
[1,2,3,1 ,2 , 3]  # Flexible whitespace around commas

# Records - semicolon separated fields
{ @name "Alice", @age 30 }
{ @x 1, @y 2, @z 3 }

# Future: Tuples (planned)
# (1, 2, 3)
```

**Why commas?** This eliminates ambiguity between multiple elements vs. function applications:
- `[1, 2, 3]` = list with three elements
- `[1 2 3]` = list with one element that's the function application `1(2)(3)` (fails with clear error)

### Built-in Functions

- **Arithmetic**: `+`, `-`, `*`, `/`
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`
- **List operations**: `head`, `tail`, `cons`, `map`, `filter`, `reduce`, `length`, `isEmpty`, `append`
- **Math utilities**: `abs`, `max`, `min`
- **String utilities**: `concat`, `toString`
- **Utility**: `print`

## Project Structure

```
src/
├── ast.ts          # Abstract Syntax Tree definitions
├── lexer.ts        # Tokenizer for whitespace-significant syntax
├── parser/         # Parser implementation
│   ├── parser.ts   # Main parser (combinator-based)
│   └── combinators.ts # Parser combinator library
├── evaluator.ts    # Interpreter for evaluating expressions
├── typer.ts        # Type inference and checking
├── repl.ts         # Interactive REPL
├── effects.ts      # Placeholder for effect handling
└── imports.ts      # Placeholder for file-based imports

test/
├── parser.test.ts    # Parser tests
├── evaluator.test.ts # Evaluator tests
└── typer.test.ts     # Type inference tests
```

## Development

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## Language Design Decisions

### Whitespace Significance

Noolang uses whitespace to indicate structure, similar to Python but with more rigorous rules:

- Indentation is used for block structure
- Semicolons are expression separators (not terminators)
- Parentheses are used for grouping expressions

### Expression-Based Design

Everything in Noolang is an expression, promoting a functional programming style:

- No statements, only expressions
- Functions are first-class values
- Immutable data structures
- All functions are curried by default

### Unambiguous Data Structures

Noolang uses semicolons as separators for all data structures to prevent parsing ambiguity:

- **Consistency**: Records, lists, and future tuples all use semicolons
- **Clarity**: No confusion between multiple elements vs. function applications
- **Flexibility**: Whitespace around semicolons is optional
- **Error Prevention**: Clear error messages when users accidentally use space-separated syntax

### Type System

The type system provides:

- **Type inference** for most expressions
- **Primitive types**: Int, String, Bool, List, Record
- **Function types**: `(Int Int) -> Int`
- **Type annotations** (planned for future versions)

### Effects

Effects are planned to be explicit and tracked:

- IO operations will be marked
- State mutations will be tracked
- Error handling will be explicit

## Future Features

- **Type annotations**: `x = 42 : Int` types are postfix for all expressions
- **Effect tracking**: Explicit IO and state effects
- **File imports**: Module system for code organization
- **Pattern matching**: Destructuring and pattern-based control flow
- **Tuples**: Ordered collections with semicolon-separated syntax
- **JavaScript compilation**: Compile to JavaScript for production use
- **Standard library**: Comprehensive built-in functions for common operations

## Contributing

This is a learning project for building programming languages. Feel free to experiment and contribute!

## License

MIT
