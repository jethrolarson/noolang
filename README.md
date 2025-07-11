# Noolang

An expression-based, LLM-friendly programming language designed for linear, declarative code with explicit effects and strong type inference.

## Features

- **Whitespace-significant syntax** (like Python, but more rigorous)
- **Expression-based** - everything is an expression
- **Strong type inference** with support for primitive types and function types
- **Functional programming** idioms and patterns
- **Pipeline operator** (`|>`) for function composition
- **Built-in primitives**: Int, String, Bool, List
- **REPL** for interactive development

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

### Examples

```noolang
# Function definition
add = (x, y) => x + y;

# Function application
add 2 3

# Pipeline operator
[1, 2, 3] |> head

# Conditional expressions
(if true then 1 else 2)

# Local bindings (using function definitions)
localAdd = (x, y) => x + y;
localAdd 1 2

# List operations
[1, 2, 3] |> tail |> head
```

## Language Syntax

### Literals

```noolang
42          # Integer
"hello"     # String
true        # Boolean
[1, 2, 3]   # List
```

### Function Definitions

```noolang
# Simple function
add = (x, y) => x + y;

# Function with multiple parameters
multiply = (a, b, c) => a * b * c;
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
(if condition then value1 else value2)
```

### Local Bindings

Local bindings are created using function definitions:

```noolang
localAdd = (x, y) => x + y;
localAdd 1 2
```

### Built-in Functions

- **Arithmetic**: `+`, `-`, `*`, `/`
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`
- **List operations**: `head`, `tail`, `cons`
- **Utility**: `print`

## Project Structure

```
src/
├── ast.ts          # Abstract Syntax Tree definitions
├── lexer.ts        # Tokenizer for whitespace-significant syntax
├── parser.ts       # Parser that builds AST from tokens
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
- Semicolons are required after definitions
- Parentheses are used for grouping expressions

### Expression-Based Design

Everything in Noolang is an expression, promoting a functional programming style:

- No statements, only expressions
- Functions are first-class values
- Immutable data structures

### Type System

The type system provides:

- **Type inference** for most expressions
- **Primitive types**: Int, String, Bool, List
- **Function types**: `(Int Int) -> Int`
- **Type annotations** (planned for future versions)

### Effects

Effects are planned to be explicit and tracked:

- IO operations will be marked
- State mutations will be tracked
- Error handling will be explicit

## Future Features

- **Type annotations**: `x : Int = 42`
- **Effect tracking**: Explicit IO and state effects
- **File imports**: Module system for code organization
- **Pattern matching**: Destructuring and pattern-based control flow
- **JavaScript compilation**: Compile to JavaScript for production use
- **Standard library**: Built-in functions for common operations

## Contributing

This is a learning project for building programming languages. Feel free to experiment and contribute!

## License

MIT