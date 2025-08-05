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
result = 2 + 3 * 4         # 14

# Function definition and application
double = fn x => x * 2
doubled = double 10        # 20

# Recursion (factorial)
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1))
fact_5 = factorial 5       # 120

# Lists and higher-order functions
numbers = [1; 2; 3; 4; 5]
squared = map (fn x => x * x) numbers  # [1; 4; 9; 16; 25]

# Records
person = { name = "Alice"; age = 30 }

# Accessing fields
name = person.name         # "Alice"
```

**Try it**: `npm start examples/basic.noo`

## Comprehensive Language Tour ([`examples/demo.noo`](../examples/demo.noo))

A complete showcase of Noolang features covering:

### 1. Literals and Basic Types

```noolang
number_literal = 42
string_literal = "Hello, Noolang!"
boolean_literal = true
unit_literal = {}           # Empty record/unit value
```

### 2. Functions and Currying

```noolang
# All functions are automatically curried
add_func = fn a b => a + b
add_ten = add_func 10       # Partial application
result = add_ten 5          # 15

# Functions are first-class values
multiply_func = fn a b => a * b
product = multiply_func 6 7  # 42
```

### 3. Recursion Examples

```noolang
# Factorial
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1))

# Fibonacci
fibonacci = fn n => 
  if n <= 1 then n 
  else (fibonacci (n - 1)) + (fibonacci (n - 2))
```

### 4. Data Structures

```noolang
# Lists
empty_list = []
number_list = [1; 2; 3; 4; 5]

# Records with named fields
person = { name = "Alice"; age = 30; city = "Wonderland" }

# Field access
person_name = person.name
person_age = person | @age   # Using pipe with accessor

# Tuples (positional fields)
point = {10; 20}            # Anonymous tuple
coordinates = point.0       # Access first element
```

### 5. Pipeline Operations

```noolang
# Forward pipeline (|>)
result = [1; 2; 3; 4; 5] 
  |> map (fn x => x * 2)
  |> filter (fn x => x > 4)
  |> head

# Thrush operator (|)
value = 10 | add 5 | multiply 2  # ((10 + 5) * 2) = 30

# Reverse pipeline (<|)
result = head <| filter (fn x => x > 4) <| map (fn x => x * 2) <| [1; 2; 3; 4; 5]
```

**Try it**: `npm start examples/demo.noo`

## Type System Examples ([`examples/type_system_demo.noo`](../examples/type_system_demo.noo))

Advanced type system features:

### Type Annotations

```noolang
# Function with explicit type
add_func = fn x y => x + y : Number -> Number -> Number

# Polymorphic function
identity = fn x => x : a -> a

# Lists with types
numbers = [1; 2; 3; 4; 5] : List Number
strings = ["hello"; "world"] : List String
```

### Records and Tuples with Types

```noolang
# Typed tuple
pair = {42; "answer"} : {Number; String}

# Typed record
person = { name = "Alice"; age = 30; active = true } 
  : { name : String; age : Number; active : Bool }
```

### Pipeline Type Inference

```noolang
# Types are inferred through pipelines
addOne = fn x => x + 1 : Number -> Number
square = fn x => x * x : Number -> Number

# Type: Number
pipeline_result = 3 |> addOne |> square

# Type: List Number
mapped_pipeline = numbers |> map addOne |> map square
```

**Try it**: `npm start --types-file examples/type_system_demo.noo`

## Trait System Examples ([`examples/trait_system_demo.noo`](../examples/trait_system_demo.noo))

Constraint-based polymorphism:

### Defining Constraints

```noolang
# Define a constraint (trait)
constraint Ord a ( 
  compare : a -> a -> Number;
  lessThan : a -> a -> Bool;
  greaterThan : a -> a -> Bool
)
```

### Implementing Constraints

```noolang
# Implement for specific type
implement Ord Number (
  compare = fn a b => if a < b then -1 else if a > b then 1 else 0;
  lessThan = fn a b => a < b;
  greaterThan = fn a b => a > b
)
```

### Using Constraints

```noolang
# Automatically resolves implementations
demo_basic = (
  intValue = show 42;           # Uses Show Number
  stringValue = show "hello";   # Uses Show String
  
  # Comparison examples
  intEquals = equals 1 1;       # Uses Eq Number
  stringEquals = equals "a" "a" # Uses Eq String
)
```

**Try it**: `npm start examples/trait_system_demo.noo`

## Algebraic Data Types ([`examples/adt_demo.noo`](../examples/adt_demo.noo))

Pattern matching and variant types:

```noolang
# Define a variant type
variant Maybe a (
  Some a;
  None
)

# Use in functions
safeDivide = fn x y => 
  if y == 0 then None
  else Some (x / y)

# Pattern matching (when implemented)
getValue = fn maybe default => match maybe with
  | Some value => value
  | None => default
```

**Try it**: `npm start examples/adt_demo.noo`

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

## Standard Library Tour ([`stdlib.noo`](../stdlib.noo))

Essential built-in functions and traits:

### Show Trait (Display/Printing)

```noolang
# Already implemented for basic types
show 42          # "42"
show "hello"     # "hello"
show [1; 2; 3]   # "[1, 2, 3]"
```

### Arithmetic Traits

```noolang
# Add trait for different types
add 5 3          # Numbers: 8
add "hello " "world"  # Strings: "hello world"

# Other arithmetic
subtract 10 3    # 7
multiply 4 5     # 20
divide 10 2      # Some 5.0 (returns Option for safety)
```

### List Operations

```noolang
# Built-in list functions
head [1; 2; 3]        # Some 1
tail [1; 2; 3]        # [2; 3]
map (fn x => x * 2) [1; 2; 3]  # [2; 4; 6]
filter (fn x => x > 2) [1; 2; 3; 4]  # [3; 4]
```

## Interactive Learning with REPL

### Exploring Types

```bash
npm start
```

```
noo> add = fn x y => x + y
add : Number -> Number -> Number

noo> .types (add)
add : Number -> Number -> Number

noo> .ast (add 5)
Application:
  func: Identifier(add)
  args: [Literal(5)]
```

### Debugging Code

```
noo> broken = fn x => x + "hello"
Type error: Cannot unify Number with String

noo> .tokens (broken 5)
[IDENTIFIER:broken, NUMBER:5, EOF]

noo> .error-detail
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

Create a function that computes the area of a circle:

```noolang
# TODO: Implement this
circleArea = fn radius => # your code here

# Test cases
test1 = circleArea 1    # Should be ~3.14159
test2 = circleArea 2    # Should be ~12.56636
```

### Exercise 2: List Processing

Implement a function that finds the maximum element in a list:

```noolang
# TODO: Implement this
maximum = fn list => # your code here

# Test
result = maximum [3; 1; 4; 1; 5; 9; 2; 6]  # Should be 9
```

### Exercise 3: Higher-Order Functions

Create a function that applies a function to each element and sums the results:

```noolang
# TODO: Implement this
mapSum = fn f list => # your code here

# Test
result = mapSum (fn x => x * x) [1; 2; 3; 4]  # Should be 30
```

### Solutions

Check the test files in [`test/`](../test/) for comprehensive examples and solutions.

## Next Steps

- **Deep dive**: Read [Type System Guide](type-system-guide.md) for advanced type features
- **Build tools**: Check [Development Guide](development-guide.md) for contributing
- **Performance**: Run `npm run benchmark` to see performance characteristics