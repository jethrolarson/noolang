# Tools & CLI Guide

> Complete guide to Noolang's command-line interface, REPL, and debugging tools.

## Source Code References
- **CLI Implementation**: [`src/cli.ts`](../src/cli.ts) - Command-line interface logic
- **REPL Implementation**: [`src/repl.ts`](../src/repl.ts) - Interactive environment
- **CLI Tests**: [`scripts/`](../scripts/) - CLI testing utilities

## Command-Line Interface

The `noo` command provides extensive debugging and execution capabilities.

### Basic Usage

```bash
# Run a Noolang file
bun start examples/demo.noo
bun start path/to/file.noo

# Evaluate expressions directly  
bun start --eval "1 + 2 * 3"
bun start -e "x = 10; x * 2"
```

### Debugging Commands

All debugging commands from [`src/cli.ts:13-29`](../src/cli.ts#L13-L29):

#### Tokenization Analysis
```bash
# Show tokens for an expression
bun start --tokens "fn x => x + 1"
bun start --tokens "{ @add fn x y => x + y }"

# Show tokens for a file
bun start --tokens-file examples/demo.noo
bun start --tokens-file stdlib.noo
```

#### AST (Abstract Syntax Tree) Analysis
```bash
# Show AST for an expression
bun start --ast "if x > 0 then x else -x"
bun start --ast "add = fn x y => x + y"

# Show AST for a file
bun start --ast-file examples/basic.noo
bun start --ast-file examples/type_system_demo.noo
```

#### Type System Analysis
```bash
# Basic type information
bun start --types "fn x => x + 1"
bun start --types-file examples/demo.noo

# Detailed type information with inference steps
bun start --types-detailed "fn x => x + 1"

# Show type environment after evaluation
bun start --types-env "add = fn x y => x + y"

# Show typed AST (AST annotated with types)
bun start --type-ast "fn x => x + 1"
bun start --type-ast-file examples/demo.noo
```

#### Symbol Analysis
```bash
# Get type information for specific symbol in file
bun start --symbol-type examples/demo.noo functionName
bun start --symbol-type stdlib.noo add
```

### Complete CLI Options

From [`src/cli.ts:13-29`](../src/cli.ts#L13-L29):

| Command | Description | Example |
|---------|-------------|---------|
| `<file>` | Execute file | `bun start demo.noo` |
| `--eval <expr>` | Evaluate expression | `bun start --eval "1 + 2"` |
| `-e <expr>` | Short form of --eval | `bun start -e "add 5 3"` |
| `--tokens <expr>` | Show tokens | `bun start --tokens "x + y"` |
| `--ast <expr>` | Show AST | `bun start --ast "fn x => x"` |
| `--tokens-file <file>` | File tokens | `bun start --tokens-file demo.noo` |
| `--ast-file <file>` | File AST | `bun start --ast-file demo.noo` |
| `--types <expr>` | Type information | `bun start --types "fn x => x"` |
| `--types-file <file>` | File types | `bun start --types-file demo.noo` |
| `--types-detailed <expr>` | Detailed typing | `bun start --types-detailed "add"` |
| `--types-env <expr>` | Type environment | `bun start --types-env "x = 5"` |
| `--type-ast <expr>` | Typed AST | `bun start --type-ast "fn x => x"` |
| `--type-ast-file <file>` | File typed AST | `bun start --type-ast-file demo.noo` |
| `--symbol-type <file> <symbol>` | Symbol type | `bun start --symbol-type demo.noo myFunc` |

## Interactive REPL

Start the REPL with:

```bash
bun start
```

### REPL Commands

All commands from [`src/repl.ts:252-305`](../src/repl.ts#L252-L305):

#### Basic Commands
- `.help` - Show complete help message
- `.quit` - Exit the REPL  
- `.exit` - Exit the REPL (alias)

#### Environment Inspection
- `.env` - Show current environment with values and types
- `.env-json` - Export environment as structured JSON
- `.types` - Show type environment

#### Debugging Commands
- `.tokens (expression)` - Show lexical tokens for expression
- `.ast (expression)` - Show abstract syntax tree for expression  
- `.ast-json (expression)` - Show AST as JSON format

#### File Operations
- `.tokens-file filename.noo` - Show tokens for entire file
- `.ast-file filename.noo` - Show AST for entire file

#### Error Analysis
- `.error-detail` - Show detailed error information
- `.error-context` - Show error context and stack trace

### REPL Command Examples

#### Environment Inspection
```
noo> x = 42
x : Number

noo> add = fn a b => a + b  
add : Number -> Number -> Number

noo> .env
Environment:
  x: 42 : Number
  add: <function> : Number -> Number -> Number

noo> .env-json
{
  "x": { "value": "42", "type": "Number" },
  "add": { "value": "<function>", "type": "Number -> Number -> Number" }
}
```

#### Debugging Expressions
```
noo> .tokens (result = (@add math) 2 3)
[IDENTIFIER:result, OPERATOR:=, PUNCTUATION:(, ACCESSOR:@add, IDENTIFIER:math, PUNCTUATION:), NUMBER:2, NUMBER:3, EOF]

noo> .ast (a = 1; b = 2)
Program:
  statements: [
    Definition:
      name: a
      value: Literal(1)
    Definition:  
      name: b
      value: Literal(2)
  ]
```

#### File Analysis
```
noo> .tokens-file examples/basic.noo
# Shows complete token stream for file

noo> .ast-file examples/demo.noo  
# Shows complete AST for file
```

### REPL Session Example

```
noo> # Define a function
noo> factorial = fn n => if n <= 1 then 1 else n * factorial (n - 1)
factorial : Number -> Number

noo> # Test it
noo> factorial 5
120 : Number

noo> # Inspect the tokens
noo> .tokens (factorial 3)
[IDENTIFIER:factorial, NUMBER:3, EOF]

noo> # Check environment
noo> .env
Environment:
  factorial: <function> : Number -> Number

noo> # Pipeline example
noo> [1, 2, 3, 4, 5] | map (fn x => x * x) | filter (fn x => x > 10)
[16, 25] : List Number
```

## Missing REPL Command

**Note**: The help text mentions `.clear-env` command, but it's not implemented in the handler. This would clear the environment state.

## Debugging Workflow

### Typical Development Flow

1. **Write code** in `.noo` file
2. **Check syntax** with `--tokens-file` and `--ast-file`
3. **Verify types** with `--types-file` 
4. **Test execution** by running the file
5. **Debug interactively** in REPL

### Type Debugging

```bash
# Check if function types are inferred correctly
bun start --types "map = fn f list => # implementation"

# See detailed type inference steps
bun start --types-detailed "complex_function arg1 arg2"

# Examine type environment after definitions
bun start --types-env "
  add = fn x y => x + y;
  multiply = fn x y => x * y;
  combine = fn x => add x (multiply x 2)
"
```

### Error Debugging

When you encounter errors:

1. Use `--tokens` to verify tokenization
2. Use `--ast` to check parsing
3. Use `--types` to see type inference issues
4. Use REPL `.error-detail` for runtime errors

### Performance Analysis

```bash
# Compare parsing performance
time bun start --ast-file large_file.noo

# Benchmark type inference
time bun start --types-file complex_types.noo

# Test execution performance  
time bun start performance_test.noo
```

## VS Code Integration

While the VS Code Language Server is work-in-progress, you can:

1. Use `.noo` file extension for syntax highlighting
2. Run CLI commands from VS Code terminal
3. Use REPL for interactive development

## Advanced Usage

### Scripting with CLI

```bash
#!/bin/bash
# Batch type checking
for file in examples/*.noo; do
  echo "Checking $file..."
  bun start --types-file "$file" || echo "Type error in $file"
done
```

### Custom Testing

```bash
# Test specific functions
bun start --eval "
  import 'mymodule.noo';
  testResult = myFunction testInput;
  assert (testResult == expectedOutput)
"
```

## Development Tools

Additional tools for Noolang development:

- **Test Suite**: `bun test` - Run all tests
- Set `AGENT=1` to reduce test output verbosity: `AGENT=1 bun test`
- **Type Checking**: `bun run typecheck` - TypeScript validation
- **Linting**: `bun run lint` - Code style checking
- **Benchmarking**: `bun run benchmark` - Performance testing

## Next Steps

- **Learn more**: Read [Language Reference](language-reference.md) for syntax details
- **See examples**: Check [Examples & Tutorials](examples-and-tutorials.md) for practical usage
- **Contribute**: Read [Development Guide](development-guide.md) for contributing to tools