---
assert: true
---

# Examples & Tutorials

> Practical examples and walkthroughs for learning Noolang through hands-on coding.

## Source Code References
- **Examples Directory**: [`examples/`](../examples/) - All example files
- **Standard Library**: [`stdlib.noo`](../stdlib.noo) - Built-in functions and traits
- **Tests**: [`test/`](../test/) - Comprehensive test cases showing expected behavior

## Getting Started Examples

### Basic Syntax ([`examples/basic.noo`](../examples/basic.noo))

The simplest introduction to Noolang syntax:

```noolang
# Simple arithmetic
result = 2 + 3 * 4;         # => 14 : Float

# Function definition and application
double = fn x => x * 2;
doubled = double 10;        # => 20 : Float

# Recursion (factorial)
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));
fact_5 = factorial 5;       # => 120 : Float

# Lists and higher-order functions
numbers = [1, 2, 3, 4, 5];
squared = map (fn x => x * x) numbers;  # => [1, 4, 9, 16, 25] : List a

# Records
person = { @name "Alice", @age 30 };
person  # => {@name "Alice", @age 30} : { @name String, @age Float }
```

**Try it**: `bun start examples/basic.noo`

## Comprehensive Language Tour ([`examples/demo.noo`](../examples/demo.noo))

A complete showcase of Noolang features covering:

### 1. Literals and Basic Types

```noolang
number_literal = 42;
string_literal = "Hello, Noolang!";
boolean_literal = True;
unit_literal = {}           # Empty record/unit value
```

### 2. Functions and Currying

```noolang
# All functions are automatically curried
add_func = fn a b => a + b;
add_ten = add_func 10;       # Partial application
result = add_ten 5;          # => 15 : Float

# Functions are first-class values
multiply_func = fn a b => a * b;
product = multiply_func 6 7  # => 42 : Float
```

### 3. Recursion Examples

```noolang
# Factorial
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1));

# Fibonacci
fibonacci = fn n => 
  if n <= 1 then n 
  else (fibonacci (n - 1)) + (fibonacci (n - 2))
```

### 4. Data Structures

```noolang
# Lists
empty_list = [];
number_list = [1, 2, 3, 4, 5];

# Records with named fields
person = { @name "Alice", @age 30, @city "Wonderland" };
person  # => {@name "Alice", @age 30, @city "Wonderland"} : { @name String, @age Float, @city String }
```

### 5. Pipeline Operations

```noolang
# Function application
doubled = map (fn x => x * 2) [1, 2, 3, 4, 5];
result = head doubled;           # => Some 2 : Option Float

# Function composition (|>)
double = fn x => x * 2;
addOne = fn x => x + 1;
composed = addOne |> double;     # Compose functions
# double (addOne 10) = double 11
value = 10 | composed;           # => 22 : Float

# Reverse composition (<|)
composed_reverse = double <| addOne;  # Same as addOne |> double
value  # => 22 : Float
```

**Try it**: `bun start examples/demo.noo`

## Type System Examples ([`examples/type_system_demo.noo`](../examples/type_system_demo.noo))

Advanced type system features:

### Type Annotations

```noolang
# Function with explicit type
add_func = (fn x y => x + y) : Float -> Float -> Float;

# Polymorphic function
identity = (fn x => x) : a -> a;

# Lists with types
numbers = [1, 2, 3, 4, 5] : List Float;
strings = ["hello", "world"] : List String
```

### Records and Tuples with Types

```noolang
# Typed tuple
pair = {42, "answer"} : {Float, String};

# Typed record
person = { @name "Alice", @age 30, @active True } 
  : { @name String, @age Float, @active Bool };
person  # => {@name "Alice", @age 30, @active True} : { @name String, @age Float, @active Bool }
```

### Pipeline Type Inference

```noolang
# Types are inferred through pipelines
addOne = fn x => x + 1;
square = fn x => x * x;

# Function composition
pipeline_result = 3 | (addOne |> square);  # => 16 : Float

# List operations
numbers = [1, 2, 3];
composed = addOne |> square;
mapped_pipeline = map composed numbers;
mapped_pipeline  # => [4, 9, 16] : List Float
```

**Try it**: `bun start --types-file examples/type_system_demo.noo`

## Trait System Examples ([`examples/trait_system_demo.noo`](../examples/trait_system_demo.noo))

Constraint-based polymorphism:

### Defining Constraints

```noolang
# Constraint systems are implemented but syntax differs
# See stdlib.noo for actual constraint definitions
# Example of using built-in Show constraint
result = show 42;  # Uses built-in Show constraint
result  # => "42" : String
```

### Implementing Constraints

```noolang
# Constraint implementations are built-in
# Example functions using constraints
lessThan = fn a b => a < b;
greaterThan = fn a b => a > b;
result = lessThan 3 5;  # => True : Bool
result
```

### Using Constraints

```noolang
# Automatically resolves implementations
intValue = show 42;           # => "42" : String
stringValue = show "hello";   # => "hello" : String

# Show for different types
boolValue = show True;        # => "True" : String
listValue = show [1, 2, 3];   # => "[1, 2, 3]" : String
listValue
```

**Try it**: `bun start examples/trait_system_demo.noo`

## Algebraic Data Types ([`examples/adt_demo.noo`](../examples/adt_demo.noo))

Pattern matching and variant types:

```noolang
# Built-in Option type is already available
# Use in functions (division already returns Option)
checkAge = fn age =>
  if age >= 18 then Some "Adult"
  else None;

# Pattern matching works
getValue = fn maybe default => match maybe (
  Some value => value;
  None => default
);

# Test it
result = getValue (checkAge 25) "Minor";
result  # => "Adult" : String
```

**Try it**: `bun start examples/adt_demo.noo`

## Advanced Examples

### Card Game ([`examples/card_game.noo`](../examples/card_game.noo))

A complete card game implementation showing:
- Complex data modeling
- Game state management  
- Pattern matching
- Constraint usage

### Pattern Matching ([`examples/pattern_matching_demo.noo`](../examples/pattern_matching_demo.noo))

Advanced pattern matching examples:
- List destructuring
- Record patterns
- Nested patterns
- Guard expressions

### Recursive ADTs ([`examples/recursive_adts.noo`](../examples/recursive_adts.noo))

Complex recursive data structures:
- Trees and graphs
- Expression evaluators
- Parser combinators

### Shell Automation ([`examples/shell_automation.noo`](../examples/shell_automation.noo))

Type-safe system operations using the `exec` builtin:

```noolang
# Execute shell commands with proper error handling
result = exec "echo" ["Hello from Noolang!"];
match result (
    Ok output => println ("Command output: " + output);
    Err error => println ("Command failed: " + show error)
);

# System information gathering
hostname_result = exec "hostname" [];
match hostname_result (
    Ok hostname => println ("Hostname: " + hostname);
    Err error => println ("Hostname error: " + show error)
);

# Error handling for non-existent commands
bad_command = exec "this_command_does_not_exist" [];
match bad_command (
    Ok output => println ("Unexpected success: " + output);
    Err error => println ("Expected error caught: " + show error)
);
```

Key features demonstrated:
- **Type-safe process execution** - All shell operations return `Result` types
- **Proper error handling** - Pattern matching on `Ok`/`Err` variants
- **Command arguments** - Pass arguments as a list of strings
- **Practical automation** - Real-world system information gathering

**Try it**: `bun start examples/shell_automation.noo`

The `exec` function enables Noolang to serve as a type-safe shell scripting language, providing the foundation for system automation while maintaining the safety guarantees of the type system.

## Standard Library Tour ([`stdlib.noo`](../stdlib.noo))

Essential built-in functions and traits:

### Show Trait (Display/Printing)

```noolang
# Already implemented for basic types
result1 = show 42;          # => "42" : String
result2 = show "hello";     # => "hello" : String
result3 = show [1, 2, 3];   # => "[1, 2, 3]" : String
result3
```

### Arithmetic Traits

```noolang
# Arithmetic operations  
result1 = 5 + 3;          # => 8 : Float
result2 = "hello " + "world";  # => "hello world" : String

# Built-in arithmetic
result3 = 10 - 3;    # => 7 : Float
result4 = 4 * 5;     # => 20 : Float
# division returns Option for safety
result5 = 10 / 2;           # => Some 5 : Option Float
# handles division by zero
result6 = 10 / 0;           # => None : Option Float
result6
```

### List Operations

```noolang
# Built-in list functions
result1 = head [1, 2, 3];        # => Some 1 : Option Float
result2 = map (fn x => x * 2) [1, 2, 3];  # => [2, 4, 6] : List Float
result3 = length [1, 2, 3, 4];   # => 4 : Float
result4 = at 1 [10, 20, 30];     # => Some 20 : Option Float
result4
```

## Interactive Learning with REPL

### Exploring Types

```bash
bun start
```

```
noolang> add = fn x y => x + y
add : Float -> Float -> Float

noolang> .types (add)
add : Float -> Float -> Float

noolang> .ast (add 5)
Application:
  func: Identifier(add)
  args: [Literal(5)]
```

### Debugging Code

```
noolang> broken = fn x => x + "hello"
Type error: Cannot unify Float with String

noolang> .tokens (broken 5)
[IDENTIFIER:broken, NUMBER:5, EOF]

noolang> .error-detail
Detailed error information...
```

## Tutorial Progression

### Beginner Path

1. **Start here**: [`examples/basic.noo`](../examples/basic.noo)
2. **Learn syntax**: [Language Reference](language-reference.md)
3. **Try REPL**: [Getting Started](getting-started.md#repl-commands)
4. **Explore types**: [`examples/type_system_demo.noo`](../examples/type_system_demo.noo)

### Intermediate Path

1. **Function composition**: [`examples/demo.noo`](../examples/demo.noo) (pipelines section)
2. **Data structures**: Record and list examples
3. **Pattern matching**: [`examples/pattern_matching_demo.noo`](../examples/pattern_matching_demo.noo)
4. **Error handling**: Option and Result types

### Advanced Path

1. **Trait system**: [`examples/trait_system_demo.noo`](../examples/trait_system_demo.noo)
2. **Complex ADTs**: [`examples/recursive_adts.noo`](../examples/recursive_adts.noo)
3. **Real applications**: [`examples/card_game.noo`](../examples/card_game.noo)
4. **Performance optimization**: Benchmarking and profiling

## Exercises

### Exercise 1: Basic Functions

Create a function that converts Celsius to Fahrenheit:

```noolang
# Temperature conversion (simplified without division)
celsiusToFahrenheit = fn celsius => celsius * 1.8 + 32;

# Test cases  
test1 = celsiusToFahrenheit 0;     # => 32 : Float
test2 = celsiusToFahrenheit 100;   # => 212 : Float
test2
```

### Exercise 2: List Processing

Implement a function that finds the last element in a list:

```noolang
# Simple list processing example
getHead = fn list => head list;

# Test
result = getHead [3, 1, 4, 1, 5, 9, 2, 6];  # => Some 3 : Option Float
empty = getHead [];                          # => None
result
```

### Exercise 3: Higher-Order Functions

Create a function that counts elements in a list that satisfy a predicate:

```noolang
# Simple higher-order function example
doubleAll = fn list => map (fn x => x * 2) list;

# Test
result = doubleAll [1, 2, 3, 4, 5];  # => [2, 4, 6, 8, 10] : List Float
empty = doubleAll [];               # => [] : List Float
result
```

### Solutions

Check the test files in [`test/`](../test/) for comprehensive examples and solutions.

## Next Steps

- **Deep dive**: Read [Type System Guide](type-system-guide.md) for advanced type features
- **Build tools**: Check [Development Guide](development-guide.md) for contributing
- **Performance**: Run `bun run benchmark` to see performance characteristics