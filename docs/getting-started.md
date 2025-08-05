# Getting Started with Noolang

> A functional, expression-based, LLM-friendly programming language designed for linear, declarative code with explicit effects and strong type inference.

## What is Noolang?

Noolang is designed to be maximally understandable by Large Language Models while still being powerful and expressive for human developers. It features:

- **Expression-based**: Everything is an expression that evaluates to a value
- **Strong type inference**: Hindley-Milner type system with automatic type deduction
- **Effect tracking**: Explicit tracking of side effects in the type system
- **Trait system**: Constraint-based polymorphism similar to Haskell typeclasses
- **Linear syntax**: Code flows naturally from left to right with pipeline operators

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd noolang
npm install
npm run build
```

## Running Noolang

### Interactive REPL

Start the interactive development environment:

```bash
npm start
```

This launches the Noolang REPL where you can experiment with the language interactively.

### Running Files

Execute a Noolang file:

```bash
npm start examples/basic.noo
```

### Quick Evaluation

Evaluate expressions directly:

```bash
npm start --eval "1 + 2 * 3"
npm start -e "x = 10; x * 2"
```

## Your First Noolang Program

### Basic Expressions

```noolang
# Numbers and arithmetic
42
1 + 2 * 3

# Strings
"Hello, World!"

# Function definition
add = fn x y => x + y

# Function application
add 5 3
```

### Pipeline Operations

Noolang excels at data transformation pipelines:

```noolang
# Left-to-right data flow
[1; 2; 3; 4] |> map (fn x => x * 2) |> filter (fn x => x > 4)

# Thrush operator for single values
5 | add 3 | multiply 2
```

### Type System

Types are inferred automatically:

```noolang
# The type system figures out these types
identity = fn x => x              # 'a -> 'a
numbers = [1; 2; 3]              # List Number
greeting = "Hello"               # String
```

## REPL Commands

The REPL provides powerful debugging and inspection tools:

### Basic Commands
- `.help` - Show all available commands
- `.quit` or `.exit` - Exit the REPL

### Environment Inspection
- `.env` - Show current environment with types
- `.types` - Show type environment
- `.env-json` - Export environment as JSON

### Debugging
- `.tokens (expression)` - Show lexical tokens
- `.ast (expression)` - Show abstract syntax tree
- `.ast-json (expression)` - Show AST as JSON

### File Operations
- `.tokens-file filename.noo` - Analyze file tokens
- `.ast-file filename.noo` - Show file AST

Example REPL session:

```
noo> add = fn x y => x + y
add : Number -> Number -> Number

noo> .tokens (add 5 3)
[IDENTIFIER:add, NUMBER:5, NUMBER:3, EOF]

noo> add 5 3
8 : Number
```

## Examples Directory

Explore the examples to learn more:

- [`examples/basic.noo`](../examples/basic.noo) - Basic language features
- [`examples/demo.noo`](../examples/demo.noo) - Comprehensive language showcase
- [`examples/type_system_demo.noo`](../examples/type_system_demo.noo) - Type system features
- [`examples/trait_system_demo.noo`](../examples/trait_system_demo.noo) - Trait system examples

## Next Steps

1. **Learn the syntax**: Read [Language Reference](language-reference.md)
2. **Understand types**: Study [Type System Guide](type-system-guide.md) 
3. **Explore tools**: Check [Tools & CLI Guide](tools-and-cli.md)
4. **Try examples**: Work through [Examples & Tutorials](examples-and-tutorials.md)

## Getting Help

- Use `.help` in the REPL for command reference
- Check [Development Guide](development-guide.md) for contributing
- Examine source code in [`src/`](../src/) for implementation details