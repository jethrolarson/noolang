# Noolang

An expression-based, LLM-friendly programming language designed for linear, declarative code with explicit effects and strong type inference.

## Current Status (June 2024)
- **All core features implemented:** parser, evaluator, type inference, REPL, CLI, and debugging tools
- **All tests passing** (parser, evaluator, typer)
- **Comma-separated data structures**: `[1, 2, 3]`, `{ @name "Alice", @age 30 }`
- **Explicit effects**: Effects are tracked in the type system (e.g., `print` is effectful)
- **Strong type inference**: Powered by a functional Hindley-Milner type inference engine with let-polymorphism. Only the new functional typer is used; the old class-based typer has been removed.
- **REPL and CLI**: Feature colorized output and advanced debugging commands (tokens, AST, types, environment, etc.)
- **Robust error handling and debugging**: All foundational issues resolved
- **VSCode syntax highlighting**: Full support for `.noo` files

## Features

- **Whitespace-significant syntax** (like Python, but more rigorous)
- **Expression-based** - everything is an expression
- **Strong type inference** with support for primitive types and function types
- **Functional programming** idioms and patterns
- **Pipeline operator** (`|>`) for function composition
- **Records and accessors** for structured data
- **Built-in primitives**: Int, String, Bool, List, Record, Unit
- **REPL** for interactive development with comprehensive debugging tools
- **Unambiguous syntax** - comma-separated data structures prevent parsing traps
- **Explicit effects**: Effects are tracked in the type system and visible in function types
- **Recursion**: Full support for recursive functions with proper closure handling
- **Mutation**: Local mutation with `mut` and `mut!` syntax

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

# Recursion
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1))

# Mutation
mut counter = 0;
mut! counter = counter + 1

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
print "hello"; map (fn x => x * 2) [4, 5, 6]
```

### Literals

```noolang
42          # Integer
"hello"     # String
true        # Boolean
{}          # Unit
[1, 2, 3]   # List (comma-separated)
{ @name "Alice", @age 30 }  # Record (comma-separated fields)
{1, 2, 3}   # Tuple (comma-separated)
```

### Function Definitions

```noolang
# Simple function
add = fn x y => x + y

# Function with multiple parameters
multiply = fn a b c => a * b * c

# Curried function (Haskell-style)
curried_add = fn a => fn b => a + b
```

### Function Application

```noolang
# Direct application
add 2 3

# Nested application
add (multiply 2 3) 4

# Curried application
curried_add 2 3
```

### Pipeline and Function Application Operators

Noolang provides three operators for function composition and application:

#### Pipeline Operator (`|>`) - Function Composition
Composes functions from left to right (like Unix pipes):
```noolang
# Chain functions: f |> g |> h means h(g(f(x)))
[1, 2, 3] |> head |> add 5
```

#### Thrush Operator (`|`) - Function Application
Applies the right function to the left value:
```noolang
# Apply function: x | f means f(x)
[1, 2, 3] | map (fn x => x * 2)
```

#### Dollar Operator (`$`) - Low-Precedence Function Application
Applies the left function to the right value with low precedence (avoids parentheses):
```noolang
# Without $ - lots of parentheses needed
map (fn x => x * 2) (filter (fn x => x > 5) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

# With $ - much cleaner
map (fn x => x * 2) $ filter (fn x => x > 5) $ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

# Method-chaining with accessors
person = { @address { @street "123 Main St", @city "Anytown" } };
street_value = person | @address | @street;  # Get the street value

# Using $ to avoid parentheses in complex expressions
# Without $ - nested parentheses
result1 = map (fn x => x * 2) (filter (fn x => x > 3) (person | @scores));

# With $ - cleaner chain
result2 = map (fn x => x * 2) $ filter (fn x => x > 3) $ (person | @scores);

# Complex nested function calls
reduce (+) 0 $ map (fn x => x * x) $ filter (fn x => x % 2 == 0) $ [1, 2, 3, 4, 5, 6]
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
user | @name        # Returns "Alice"
user | @age         # Returns 30

# Chained accessors (with extra fields)
complex = { @bar { @baz fn x => { @qux x } } }
(((complex | @bar) | @baz) $ 123) | @qux  # Returns 123

# Accessors can be composed or used as functions
getName = @name;
getName user        # Same as user | @name
```

### Recursion

Noolang supports recursive functions with proper closure handling:

```noolang
# Factorial function
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1))

# Fibonacci function
fibonacci = fn n => if n <= 1 then n else (fibonacci (n - 1)) + (fibonacci (n - 2))

# List operations with recursion
length = fn list => if (isEmpty list) then 0 else 1 + (length (tail list))
```

### Mutation

Noolang supports local mutation with explicit syntax:

```noolang
# Mutable variable declaration
mut counter = 0

# Mutation (updating the variable)
mut! counter = counter + 1

# Mutation in expressions
mutation_demo = (
  mut counter = 0;
  mut! counter = counter + 1;
  counter
)
```

### Data Structure Syntax

Noolang uses commas as separators for all data structures:

```noolang
# Lists - comma separated
[1, 2, 3]
[1,2,3,1,2,3]  # Flexible whitespace around commas

# Records - comma separated fields
{ @name "Alice", @age 30 }
{ @x 1, @y 2, @z 3 }

# Tuples - comma separated
{1, 2, 3}
{10, 20}
```

**Why commas?** This provides a familiar, consistent syntax across all data structures:
- `[1, 2, 3]` = list with three elements
- `{ @name "Alice", @age 30 }` = record with two fields
- `{1, 2, 3}` = tuple with three elements

### Built-in Functions

- **Arithmetic**: `+`, `-`, `*`, `/`
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=`
- **List operations**: `head`, `tail`, `cons`, `map`, `filter`, `reduce`, `length`, `isEmpty`, `append`
- **Record operations**: Accessors (`@field`) for getting record fields
- **Math utilities**: `abs`, `max`, `min`
- **String utilities**: `concat`, `toString`
- **Utility**: `print`

## Duck-Typed Records and Accessors

Noolang records are **duck-typed**: any record with the required field(s) can be used, regardless of extra fields. This makes accessors and record operations flexible and ergonomic, similar to JavaScript or Python objects.

### Example

```noolang
# Record with extra fields
duck_person = { @name "Bob", @age 42, @extra "ignored" }
duck_name = duck_person | @name  # Returns "Bob"

# Chained accessors with extra fields
complex = { @bar { @baz fn x => { @qux x }, @extra 42 } }
duck_chain = (((complex | @bar) | @baz) $ 123) | @qux  # Returns 123
```

- **Accessors** (`@field`) work with any record that has the required field, even if there are extra fields.
- **Accessor chains** work as long as each step has the required field.
- This enables ergonomic, method-chaining-like patterns and makes Noolang more LLM-friendly and expressive.

## VSCode Support

Noolang has full VSCode syntax highlighting support:

1. **Install the extension**: Use the provided `noolang-0.1.0.vsix` file
2. **Automatic activation**: `.noo` files will automatically use Noolang syntax highlighting
3. **Features**: Keywords, operators, data structures, accessors, comments, and more are highlighted

## Project Structure

```
src/
  ├── ast.ts          # Abstract Syntax Tree definitions
  ├── lexer.ts        # Tokenizer for whitespace-significant syntax
  ├── parser/         # Parser implementation
  │   ├── parser.ts   # Main parser (combinator-based)
  │   └── combinators.ts # Parser combinator library
  ├── evaluator.ts    # Interpreter for evaluating expressions
  ├── typer_functional.ts # Type inference and checking
  ├── repl.ts         # Interactive REPL
  ├── cli.ts          # Command-line interface
  └── format.ts       # Value formatting and output

test/
  ├── parser.test.ts    # Parser tests
  ├── evaluator.test.ts # Evaluator tests
  └── typer_functional.test.ts # Type inference tests

syntaxes/
  └── noolang.tmLanguage.json # VSCode syntax highlighting
```

## Development

### Running Tests

```bash
npm test
```

All tests use the functional typer. Some advanced constraint-propagation tests are skipped until the constraint system is fully implemented.

### Building

```bash
npm run build
```

### VSCode Extension

```bash
npm run vscode:package  # Create extension package
```

## Language Design Decisions

#### Duck-Typed Records

- **Permissive record unification**: Any record with the required fields matches, regardless of extra fields
- **Accessors**: Work with any record that has the field, enabling flexible and ergonomic code
- **Chaining**: Accessor chains and method-chaining patterns are natural and concise
- **LLM-friendly**: Less rigid type constraints, more natural code generation

### Expression-Based Design

Everything in Noolang is an expression, promoting a functional programming style:

- No statements, only expressions
- Functions are first-class values
- Immutable data structures by default
- All functions are curried by default

### Consistent Data Structures

Noolang uses commas as separators for all data structures for consistency and familiarity:

- **Consistency**: Records, lists, and tuples all use commas
- **Familiarity**: Matches common programming language conventions
- **Flexibility**: Whitespace around commas is optional
- **Clarity**: Clear distinction between data structures and function applications

### Type System

The type system provides:

- **Type inference** for all expressions using a functional Hindley-Milner engine
- **Primitive types**: Int, String, Bool, List, Record, Unit
- **Function types**: `(Int Int) -> Int`
- **Type constraints**: Early support for constraints (e.g., Collection, hasField) is present, but advanced constraint propagation is still in progress
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
- **JavaScript compilation**: Compile to JavaScript for production use
- **Standard library**: Comprehensive built-in functions for common operations

## Contributing

This is a learning project for building programming languages. Feel free to experiment and contribute!

## License

MIT
