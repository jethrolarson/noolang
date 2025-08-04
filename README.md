# Noolang

An functional, expression-based, LLM-friendly programming language designed for linear, declarative code with explicit effects and strong type inference.

## Features
- **Expression-based** - everything is an expression
- **Strong type inference** with Hindley-Milner
- **Trait system** - constraint definitions and implementations
- **Effect system** - explicit effect tracking in types
- **Where expressions** - local definitions within expressions
- **Pipeline operators** (`|>`, `<|`, `|`, `|?`, `$`) for composition
- **ADTs** - algebraic data types with pattern matching
- **Records & tuples** - structured data with type safety
- **Destructuring patterns** - ergonomic data extraction and import spreading
- **REPL** - interactive development environment
- **VSCode Language Server** - for intellisense and hover types (WIP)
- **Syntax Highlighting** - for VSCode and other editors


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

### CLI Debugging Tools

The CLI provides extensive debugging capabilities for development:

```bash
# Execute expressions
npm start -- --eval "1 + 2 * 3"
npm start -- -e "x = 10; x * 2"

# Debug tokenization
npm start -- --tokens "fn x => x + 1"
npm start -- --tokens-file examples/demo.noo

# Debug parsing (AST)
npm start -- --ast "if x > 0 then x else -x"
npm start -- --ast-file examples/demo.noo

# Debug type inference
npm start -- --types "fn x => x + 1"
npm start -- --types-file examples/demo.noo
npm start -- --types-detailed "fn x => x + 1"
npm start -- --types-env "fn x => x + 1"
npm start -- --type-ast "fn x => x + 1"
npm start -- --type-ast-file examples/demo.noo

# Run files
npm start -- examples/demo.noo
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

**Note**: REPL Commands use `.` prefix and parentheses `(expr)` for expressions to avoid conflicts with future type annotations.


### Examples

**Note**: Some examples in the `examples/` directory have known issues due to current type system limitations. See `docs/LANGUAGE_WEAKNESSES.md` for details. Working examples include `basic.noo`, `adt_demo.noo`, `recursive_adts.noo`, `safe_thrush_demo.noo`, `simple_adt.noo`, and `math_functions.noo`.

```noolang
# Function definition
add = fn x y => x + y

# Function application doesn't require parens and `,` is only used for separating items in data structures like `Tuple`, `Record` and `List`
add 2 3

# The + operator works for both numbers and strings
1 + 2           # => 3 : Int
"hello" + " world"  # => "hello world" : String

# all functions are curried so if you pass less than their full number of arguments you get back a partially applied function
increment = add 1;
increment 2 
# 3 : Float

# to nest calls you may need parenthesis
add 2 (add 3 2)

# strictly speaking you never pass more than one argument
add 1 2 
# is actually 
((add 1) 2)
# in javascript this could be seen as `const add = x => y => x + y; add(1)(2);`

# Where expressions for local definitions
x + y where (x = 1; y = 2)  # => 3

# Destructuring for clean data extraction
{x, y} = {10, 20}; x + y  # => 30
{@name, @age} = {@name "Alice", @age 30}; name  # => "Alice"

# because nesting can get confusing fast noolang includes a few helpful opperators for reducing the need for parens such as the `|` operator:
2 | add 3 | add 2

[1, 2, 3] | map (add 1) # => [2, 3, 4]

# the $ operator acts like a weak function application operator allowing you to often skip parens on the right hand expression:
[1, 2, 3] | map $ add 1

# can be written as



# Conditional expressions
if True then 1 else 2

# Records
user = { @name "Alice", @age 30 }

# Accessors
(@name user)

# Recursion
factorial = fn n => if n == 0 then 1 else n * (factorial (n - 1))

# Where expressions in functions
fn x => x * 2 where (x = 5)  # => 10

# Mutation
mut counter = 0;
mut! counter = counter + 1

# List operations
[1, 2, 3] |> tail |> head

# Algebraic Data Types
type Color = Red | Green | Blue;
favorite = Red;

type Option a = Some a | None;
result = match (Some 42) with (Some x => x; None => 0)

# Pattern matching with ADTs
type Point = Point Float Float;
point = Point 10 20;
x = match point with (Point x y => x)

# Recursive ADTs (Binary Tree)
type Tree a = Node a (Tree a) (Tree a) | Leaf;
tree = Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf);
sum = fn t => match t with (
    Node value left right => value + (sum left) + (sum right);
    Leaf => 0
);
tree_sum = sum tree  # => 15

# Tuple pattern matching
coordinates = {10, 20, 30};
sum = match coordinates with (
    {x, y, z} => x + y + z;
    {x, y} => x + y;
    _ => 0
)

# Record pattern matching  
user = { @name "Alice", @age 30, @city "NYC" };
greeting = match user with (
    {@name n, @age a} => "Hello " + n + ", age " + toString a;
    _ => "Unknown user"
)

# Nested patterns with constructors
data = Some {10, 20};
result = match data with (
    Some {x, y} => x * y;
    Some _ => 0;
    None => -1
)

# Destructuring patterns for data extraction
{x, y} = {10, 20}
{@name, @age} = {@name "Bob", @age 25}
{@name userName, @age} = {@name "Alice", @age 30}  # Renaming

# Nested destructuring
{outer, {inner, rest}} = {1, {2, 3}}
{@user {@name, @age}} = {@user {@name "Charlie", @age 35}}
{@coords {x, y}, @metadata {@name author}} = {@coords {5, 10}, @metadata {@name "Dave"}}

# Import spreading with destructuring  
{@add, @multiply} = import "math_module"
{@square sq, @cube cb} = import "power_module"  # With renaming
```

## Language Syntax

### Program Structure

**Files are single expression**: Each Noolang file contains exactly one top-level expression. However...

**Semicolon (`;`) is an expression sequencer, not a terminator**:
- Left side expression is evaluated and discarded
- Right side expression is evaluated and returned
- This allows for sequencing operations while only returning the final result
- This is the most commonly used for defining variables but can also be used to sequence effects
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

Noolang provides several operators for function composition and application:

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

#### Safe Thrush Operator (`|?`) - Monadic Chaining
Safely applies functions to monadic values (like Option), implementing smart monadic bind behavior:
```noolang
# Safe application to Some values
Some 42 |? (fn x => x + 10)     # Some 52

# None values short-circuit  
None |? (fn x => x + 10)         # None

# Monadic bind: functions returning Options don't get double-wrapped
safe_divide = fn x => if x == 0 then None else Some (100 / x);
Some 10 |? safe_divide           # Some 10 (not Some Some 10)

# Functions returning regular values get automatically wrapped
Some 5 |? (fn x => x * 2)        # Some 10

# Chaining operations with short-circuiting
Some 10 |? (fn x => x + 5) |? (fn x => x * 2) |? safe_divide  # Some 6
Some 0 |? (fn x => x + 5) |? (fn x => x * 2) |? safe_divide   # None
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

### Where Expressions

Local definitions within expressions:

```noolang
# Simple where expression
x + y where (x = 1)

# Multiple definitions
x + y where (x = 1; y = 2)

# Complex expressions
result where (
  x = 10;
  y = 20;
  result = x * y + 5
)
```

### Trait System

Constraint-based polymorphism:

```noolang
# Define constraint
constraint Display a ( display : a -> String );

# Implement constraint
implement Display Float ( display = toString );
implement Display String ( display = fn s => s );

# Automatic resolution
display 42              # "42"
display "hello"         # "hello"
```

### Effect System

Explicit effect tracking:

```noolang
# Pure function
add = fn x y => x + y : (Float) -> (Float) -> Float

# Effectful function
print = fn msg => ... : String !write
log = fn msg => ... : String !log

# Effect propagation
logger = fn x => print x;  # Inherits !write
logger 42                  # Has !write effect
```

#### Built-in Effects
- `!write` - Output operations (print, writeFile)
- `!log` - Logging operations
- `!read` - Input operations (readFile)
- `!rand` - Random generation
- `!state` - State mutation

#### Where Expressions in Function Bodies

Where expressions work seamlessly within function bodies:

```noolang
# Function with where clause
fn x => x * 2 where (x = 5)

# Complex function with multiple where definitions
fn input => 
  if input > 0 then positive else negative 
  where (
    positive = input * 2;
    negative = input - 10
  )

# Where expressions with nested logic
fn x => 
  if x > 0 then x * 2 else 0 
  where (x = 5)
```

#### Where Expressions with Mutable Definitions

Where expressions support both regular and mutable definitions:

```noolang
# Regular definitions in where clause
result where (
  x = 1;
  y = 2;
  result = x + y
)

# Mutable definitions in where clause
result where (
  mut counter = 0;
  mut! counter = counter + 1;
  result = counter
)
```

#### Where Expressions with Complex Types

Where expressions work with all Noolang data structures:

```noolang
# With records
user_info where (
  user = { @name "Alice", @age 30 };
  user_info = user | @name + " is " + toString (user | @age) + " years old"
)

# With lists
sum_squares where (
  numbers = [1, 2, 3, 4, 5];
  squares = map (fn x => x * x) numbers;
  sum_squares = reduce (+) 0 squares
)

# With pattern matching
safe_head where (
  list = [1, 2, 3];
  safe_head = match list with (
    [] => None;
    [head, ...] => Some head
  )
)
```

#### Where Expression Semantics

- **Scope**: Definitions in the where clause are only visible to the main expression
- **Evaluation**: Where expressions evaluate the main expression in the context of the where definitions
- **Return Value**: The result of the main expression is returned
- **Environment**: Where clauses create a new lexical scope for their definitions

#### Benefits of Where Expressions

1. **Local Scope**: Keep temporary variables local to the expression
2. **Readability**: Break complex expressions into readable parts
3. **Reusability**: Define intermediate values that can be used multiple times
4. **Functional Style**: Maintain functional programming principles with local state

### Records and Accessors

```noolang
# Record creation
user = { @name "Alice", @age 30, @city "NYC" }

# Accessor usage (accessors are functions)
user | @name        # Returns "Alice"
user | @age         # Returns 30

# Chained accessors (with extra fields)
complex = { @bar { @baz fn x => { @qux x }, @extra 42 } }
duck_chain = (((complex | @bar) | @baz) $ 123) | @qux  # Returns 123

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

### Destructuring Patterns

Noolang supports comprehensive destructuring for tuples and records, enabling ergonomic data extraction and import spreading:

```noolang
# Basic tuple destructuring
{x, y} = {10, 20}           # x = 10, y = 20

# Basic record destructuring
{@name, @age} = {@name "Alice", @age 30}  # name = "Alice", age = 30

# Record destructuring with renaming
{@name userName, @age userAge} = {@name "Bob", @age 25}  # userName = "Bob", userAge = 25

# Nested tuple destructuring
{outer, {inner, rest}} = {1, {2, 3}}  # outer = 1, inner = 2, rest = 3

# Nested record destructuring
{@user {@name, @age}} = {@user {@name "Charlie", @age 35}}  # name = "Charlie", age = 35

# Complex mixed patterns
{@coords {x, y}, @metadata {@name author}} = {
  @coords {10, 20}, 
  @metadata {@name "Dave"}
}  # x = 10, y = 20, author = "Dave"

# Import spreading with destructuring
{@add, @multiply} = import "math_module"  # Extract functions from module
{@square sq, @cube cb} = import "power_module"  # Extract with renaming

# Works in where expressions
result where (
  {x, y} = {5, 10};
  {@name} = {@name "Test"};
  result = x + y
)
```

**Design Principles:**
- **Safety First**: Only supports destructuring for statically-known structures
- **No List Destructuring**: Lists have variable length, making patterns unsafe
- **Immutable Bindings**: Creates new immutable variable bindings
- **Type Safety**: Full static analysis and error detection
- **Clear Syntax**: LLM-friendly and predictable patterns

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

Noolang provides a set of built-in functions organized by category:

#### Arithmetic Operations (Pure)
- **`+`** - Addition: `Float -> Float -> Float`
- **`-`** - Subtraction: `Float -> Float -> Float` 
- **`*`** - Multiplication: `Float -> Float -> Float`
- **`/`** - Division: `Float -> Float -> Option Float`
- **`%`** - Modulus: `Float -> Float -> Float`

#### Comparison Operations (Pure)
- **`==`** - Equality: `a -> a -> Bool` (polymorphic)
- **`!=`** - Inequality: `a -> a -> Bool` (polymorphic)
- **`<`** - Less than: `Float -> Float -> Bool`
- **`>`** - Greater than: `Float -> Float -> Bool`
- **`<=`** - Less than or equal: `Float -> Float -> Bool`
- **`>=`** - Greater than or equal: `Float -> Float -> Bool`

#### Function Application and Composition (Pure)
- **`|`** - Thrush operator (function application): `a -> (a -> b) -> b`
- **`|?`** - Safe thrush operator (monadic chaining): `m a -> (a -> m b) -> m b`
- **`|>`** - Pipeline operator (left-to-right composition): `(a -> b) -> (b -> c) -> (a -> c)`
- **`<|`** - Compose operator (right-to-left composition): `(b -> c) -> (a -> b) -> (a -> c)`
- **`$`** - Dollar operator (low precedence function application): `(a -> b) -> a -> b`
- **`;`** - Semicolon operator (sequence): `a -> b -> b`

#### List Operations (Pure)
- **`tail`** - Get list tail: `List a -> List a`
- **`cons`** - Prepend element: `a -> List a -> List a`
- **`map`** - Map function over list: `(a -> b) -> List a -> List b`
- **`filter`** - Filter list with predicate: `(a -> Bool) -> List a -> List a`
- **`reduce`** - Reduce list with accumulator: `(b -> a -> b) -> b -> List a -> b`
- **`length`** - Get list length: `List a -> Float`
- **`isEmpty`** - Check if list is empty: `List a -> Bool`
- **`append`** - Concatenate two lists: `List a -> List a -> List a`

#### Math Utilities (Pure)
- **`abs`** - Absolute value: `Float -> Float`
- **`max`** - Maximum of two numbers: `Float -> Float -> Float`
- **`min`** - Minimum of two numbers: `Float -> Float -> Float`

#### String Operations (Pure)
- **`concat`** - Concatenate strings: `String -> String -> String`
- **`toString`** - Convert value to string: `a -> String`

#### Record Operations (Pure)
- **`hasKey`** - Check if record has key: `Record -> String -> Bool`
- **`hasValue`** - Check if record has value: `Record -> a -> Bool`
- **`set`** - Set field in record: `accessor -> Record -> a -> Record`
- **Accessors** - `@field` for getting record fields: `Record -> a`

#### Tuple Operations (Pure)
- **`tupleLength`** - Get tuple length: `Tuple -> Float`
- **`tupleIsEmpty`** - Check if tuple is empty: `Tuple -> Bool`

#### I/O Operations (Effectful)
- **`print`** - Print value: `a -> a` (effect: `!write`)
- **`println`** - Print line: `a -> a` (effect: `!write`)
- **`readFile`** - Read file: `String -> String` (effect: `!read`)
- **`writeFile`** - Write file: `String -> String -> Unit` (effect: `!write`)
- **`log`** - Log message: `String -> Unit` (effect: `!log`)

#### Random Number Generation (Effectful)
- **`random`** - Random integer: `Float` (effect: `!rand`)
- **`randomRange`** - Random in range: `Float -> Float -> Float` (effect: `!rand`)

#### Mutable State Operations (Effectful)
- **`mutSet`** - Set mutable reference: `ref -> a -> Unit` (effect: `!state`)
- **`mutGet`** - Get mutable reference: `ref -> a` (effect: `!state`)

#### ADT Constructors and Utilities

**Option Type:**
- **`Some`** - Option constructor: `a -> Option a`
- **`None`** - Empty option: `Option a`
- **`isSome`** - Check if Option is Some: `Option a -> Bool`
- **`isNone`** - Check if Option is None: `Option a -> Bool`
- **`unwrap`** - Extract value from Some: `Option a -> a` (throws on None)

**Result Type:**
- **`Ok`** - Success constructor: `a -> Result a b`
- **`Err`** - Error constructor: `b -> Result a b`
- **`isOk`** - Check if Result is Ok: `Result a b -> Bool`
- **`isErr`** - Check if Result is Err: `Result a b -> Bool`

**Boolean Type:**
- **`True`** - Boolean true constructor
- **`False`** - Boolean false constructor

### Standard Library Functions

The following functions are defined in `stdlib.noo` and automatically loaded:

#### List Operations (Standard Library)
- **`head`** - Safe head function: `List a -> Option a` (returns `None` for empty lists)

#### Utility Functions (Standard Library)
- **`id`** - Identity function: `a -> a`
- **`compose`** - Function composition: `(b -> c) -> (a -> b) -> (a -> c)`

#### Boolean Operations (Standard Library)
- **`not`** - Boolean negation: `Bool -> Bool`
- **`bool_and`** - Boolean AND: `Bool -> Bool -> Bool`
- **`bool_or`** - Boolean OR: `Bool -> Bool -> Bool`

#### Option Utilities (Standard Library)
- **`option_get_or`** - Extract Option with default: `a -> Option a -> a`
- **`option_map`** - Map over Option: `(a -> b) -> Option a -> Option b`

#### Result Utilities (Standard Library)
- **`result_get_or`** - Extract Result with default: `a -> Result a b -> a`
- **`result_map`** - Map over Result: `(a -> b) -> Result a b -> Result b c`

### Effect System

Noolang has a comprehensive effect system that tracks side effects in function types. Effects are denoted with the `!effect` syntax:

#### Available Effects:
- **`!read`** - File/input reading operations
- **`!write`** - Output/printing operations  
- **`!log`** - Logging operations
- **`!state`** - Mutable state operations
- **`!rand`** - Random number generation
- **`!time`** - Time-related operations
- **`!ffi`** - Foreign function interface
- **`!async`** - Asynchronous operations

#### Effect Syntax:
```noolang
# Pure function (no effects)
add = fn x y => x + y : Float -> Float -> Float

# Effectful function
readAndPrint = fn filename => (
  content = readFile filename;
  print content
) : String -> String !read !write
```

Effects automatically propagate through function composition and are validated by the type system.

## Algebraic Data Types (ADTs)

Noolang supports **Algebraic Data Types** for creating custom types with constructors and pattern matching. This enables type-safe modeling of complex data structures and provides powerful pattern-based control flow.

### Type Definitions

Define custom types with multiple constructors:

```noolang
# Simple enum-like types
type Color = Red | Green | Blue;

# Types with parameters
type Option a = Some a | None;
type Result a b = Ok a | Err b;

# Types with multiple parameters
type Point a = Point a a;
type Shape = Circle Float | Rectangle Float Float;
```

### Built-in ADTs

Noolang provides two essential ADTs out of the box:

#### Option Type
For handling nullable values safely:

```noolang
# Creating Option values
some_value = Some 42;
no_value = None;

# Safe division function
safe_divide = fn a b => if b == 0 then None else Some (a / b);
result = safe_divide 10 2;  # Some 5
```

#### Result Type  
For error handling:

```noolang
# Creating Result values
success = Ok "Operation succeeded";
failure = Err "Something went wrong";

# Function that may fail
parse_number = fn str => if str == "42" then Ok 42 else Err "Invalid";
valid = parse_number "42";    # Ok 42
invalid = parse_number "abc"; # Err "Invalid"
```

### Pattern Matching

Use `match` expressions to destructure ADTs and handle different cases:

```noolang
# Basic pattern matching
handle_option = fn opt => match opt with (
  Some value => value * 2;
  None => 0
);

# Pattern matching with multiple constructors
area = fn shape => match shape with (
  Circle radius => radius * radius * 3;
  Rectangle width height => width * height;
  Triangle a b c => (a * b) / 2
);

# Extracting values from constructors
get_coordinate = fn point => match point with (
  Point x y => { @x x, @y y }
);
```

### Constructor Functions

ADT constructors are automatically created as curried functions:

```noolang
type Point a = Point a a;

# Constructors work as functions
origin = Point 0 0;
make_point = Point;        # Partially applied constructor
point_10 = make_point 10;  # Function waiting for second argument
complete = point_10 20;    # Point 10 20
```

### Integration with Existing Features

ADTs work seamlessly with Noolang's existing features:

```noolang
# With higher-order functions
options = [Some 1, None, Some 3];
extract = fn opt => match opt with (Some x => x; None => 0);
values = map extract options;  # [1, 0, 3]

# With type constraints (automatic)
shapes = [Circle 5, Rectangle 10 20];
areas = map area shapes;       # Areas of all shapes

# With pipeline operators
result = Some 42 | match (Some x => x * 2; None => 0);  # 84
```

### Pattern Syntax

Pattern matching supports various pattern types:

```noolang
# Constructor patterns with variables
match value with (Some x => x; None => 0)

# Tuple patterns - destructure tuples
match point with (
    {x, y} => x + y;           # 2D point
    {x, y, z} => x + y + z;    # 3D point
    _ => 0                     # Any other case
)

# Record patterns - destructure records by field name
match user with (
    {@name n, @age a} => n + " is " + toString a;
    {@name n} => "Name: " + n;  # Partial matching
    _ => "Unknown"
)

# Mixed literal and variable patterns in tuples
match coordinates with (
    {0, 0} => "origin";        # Literal values
    {x, 0} => "x-axis";        # Mix literals and variables
    {0, y} => "y-axis";
    {x, y} => "quadrant"
)

# Nested patterns (constructors with tuples/records)
match data with (
    Some {x, y} => x * y;      # Constructor with tuple pattern
    Some {@value v} => v;      # Constructor with record pattern
    None => 0
)

# Complex nested patterns
match result with (
    Ok {@user {@name n, @age a}} => "User: " + n;
    Ok _ => "Success";
    Err msg => "Error: " + msg
)

# Wildcard patterns
match color with (Red => 1; _ => 0)
```

### Type Safety

ADTs provide compile-time type safety:

- **Constructor validation**: Wrong number of arguments to constructors is caught
- **Pattern completeness**: Missing pattern cases are detected  
- **Type inference**: ADT types are inferred correctly
- **Constraint propagation**: Type constraints work with custom ADTs

### Tuple and Record Pattern Matching

**New Feature**: Noolang now supports comprehensive pattern matching for tuples and records in addition to ADTs:

#### Tuple Patterns
Destructure tuples by position:
```noolang
# Basic tuple destructuring
point = {10, 20};
match point with ({x, y} => x + y)  # Returns 30

# Mixed literals and variables
match coordinates with (
    {0, 0} => "origin";
    {x, 0} => "x-axis point";
    {0, y} => "y-axis point";
    {x, y} => "general point"
)

# Variable-length matching
match data with (
    {a} => "single: " + toString a;
    {a, b} => "pair: " + toString (a + b);
    {a, b, c} => "triple: " + toString (a + b + c);
    _ => "other"
)
```

#### Record Patterns
Destructure records by field name with partial matching support:
```noolang
# Basic record destructuring
person = { @name "Alice", @age 30, @city "NYC" };
match person with (
    {@name n, @age a} => n + " is " + toString a + " years old"
)

# Partial field matching (ignores extra fields)
match person with (
    {@name n} => "Hello " + n;  # Ignores @age and @city
    _ => "No name found"
)

# Complex nested record patterns
user = { @profile { @name "Bob", @settings { @theme "dark" } } };
match user with (
    {@profile {@name n, @settings {@theme t}}} => n + " uses " + t + " theme";
    _ => "unknown user"
)
```

#### Integration with ADTs
Combine constructor, tuple, and record patterns:
```noolang
# Constructor with tuple argument
data = Some {10, 20};
match data with (
    Some {x, y} => x * y;    # Destructure tuple inside Some
    None => 0
)

# Constructor with record argument  
user_result = Ok { @name "Alice", @role "admin" };
match user_result with (
    Ok {@name n, @role "admin"} => "Admin: " + n;
    Ok {@name n} => "User: " + n;
    Err msg => "Error: " + msg
)
```

### Current Implementation Status

- ✅ **Type definitions**: `type Name = Constructor1 | Constructor2`
- ✅ **Pattern matching**: `match expr with (pattern => expr; ...)`  
- ✅ **Built-in types**: Option and Result types with utility functions
- ✅ **Constructor functions**: Automatic curried constructor creation
- ✅ **Type checking**: Full type safety with inference
- ✅ **Integration**: Works with all existing language features
- ✅ **Literal patterns**: Support for matching on numbers and strings (e.g., `Code 404`)
- ✅ **Nested patterns**: Support for complex nested constructor patterns (e.g., `Wrap (Value n)`)
- ✅ **Recursive types**: Full support for recursive ADT definitions with pattern matching
- ✅ **Complex patterns**: Complete pattern matching with all pattern types
- ✅ **Tuple patterns**: Full destructuring with literal/variable mixing
- ✅ **Record patterns**: Partial field matching with nested support
- ✅ **Mixed patterns**: Constructor + tuple/record pattern combinations
- ✅ **Destructuring patterns**: Complete tuple and record destructuring with nesting
- ✅ **Import spreading**: Destructuring imports with renaming support

### Recursive ADTs

**New Feature**: Noolang now supports **recursive algebraic data types**, enabling the definition of self-referential data structures like trees, linked lists, and other recursive patterns.

#### Defining Recursive Types

Recursive ADTs can reference themselves in their constructor definitions:

```noolang
# Binary Tree
type Tree a = Node a (Tree a) (Tree a) | Leaf;

# Linked List  
type LinkedList a = Cons a (LinkedList a) | Nil;

# JSON-like data structure
type JsonValue = 
    JsonObject (List {String, JsonValue}) |
    JsonArray (List JsonValue) |
    JsonString String |
    JsonNumber Float |
    JsonBool Bool |
    JsonNull;
```

#### Working with Recursive ADTs

**Tree Construction and Traversal:**

```noolang
# Create a binary tree
tree = Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf);

# Tree traversal with pattern matching
getValue = fn t => match t with (
    Node value left right => value;
    Leaf => 0
);

# Recursive tree operations
sumTree = fn t => match t with (
    Node value left right => value + (sumTree left) + (sumTree right);
    Leaf => 0
);

# Tree depth calculation
depth = fn t => match t with (
    Node _ left right => 1 + max (depth left) (depth right);
    Leaf => 0
);

getValue tree;  # => 5
sumTree tree;   # => 15 (5+3+7)
```

**Linked List Operations:**

```noolang
# Create a linked list
myList = Cons 1 (Cons 2 (Cons 3 Nil));

# Recursive sum function
sum = fn lst => match lst with (
    Cons head tail => head + (sum tail);
    Nil => 0
);

# List length calculation  
length = fn lst => match lst with (
    Cons _ tail => 1 + (length tail);
    Nil => 0
);

# List map function
listMap = fn f lst => match lst with (
    Cons head tail => Cons (f head) (listMap f tail);
    Nil => Nil
);

sum myList;           # => 6
length myList;        # => 3
listMap (add 1) myList; # => Cons 2 (Cons 3 (Cons 4 Nil))
```

**Complex Recursive Structures:**

```noolang
# Expression tree for a simple calculator
type Expr = 
    Add Expr Expr |
    Multiply Expr Expr |
    Number Float;

# Evaluate expression tree
eval = fn expr => match expr with (
    Add left right => (eval left) + (eval right);
    Multiply left right => (eval left) * (eval right);
    Number n => n
);

# Example: (2 + 3) * 4
calculation = Multiply (Add (Number 2) (Number 3)) (Number 4);
eval calculation;  # => 20
```

#### Pattern Matching with Recursive Types

Recursive ADTs work seamlessly with Noolang's pattern matching:

```noolang
# Find element in tree
contains = fn target tree => match tree with (
    Node value left right => 
        if value == target 
        then True 
        else (contains target left) || (contains target right);
    Leaf => False
);

# Transform tree values
mapTree = fn f tree => match tree with (
    Node value left right => 
        Node (f value) (mapTree f left) (mapTree f right);
    Leaf => Leaf
);

# Create tree: Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf)
tree = Node 5 (Node 3 Leaf Leaf) (Node 7 Leaf Leaf);

contains 3 tree;     # => True
contains 10 tree;    # => False
mapTree (multiply 2) tree;  # Double all values in tree
```

#### Type Safety with Recursion

Recursive ADTs maintain full type safety:

```noolang
# Type inference works correctly
numberTree = Node 42 Leaf Leaf;          # Tree Float
stringTree = Node "hello" Leaf Leaf;     # Tree String

# Pattern matching ensures exhaustiveness
safeTail = fn lst => match lst with (
    Cons _ tail => Some tail;
    Nil => None
);
```

**Note**: Recursive ADTs support all existing Noolang features including higher-order functions, pipeline operators, and integration with the constraint system.

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

## Trait System with Constraint Resolution

Noolang features a **comprehensive trait system** that enables constraint-based polymorphism through constraint definitions, implementations, and automatic type-directed dispatch. Constraint and implement statements work at the top level of programs. This provides a foundation for advanced type system features similar to Haskell's type classes or Rust's traits.

### Constraint Definitions

Define constraints that specify required functions and their signatures:

```noolang
# Simple constraint with one function
constraint Show a ( show : a -> String );

# Constraint with multiple functions
constraint Eq a ( 
  equals : a -> a -> Bool; 
  notEquals : a -> a -> Bool 
);

# Complex constraint with generic functions
constraint Monad m (
  return : a -> m a;
  bind : m a -> (a -> m b) -> m b
);
```

### Constraint Implementations

Provide implementations of constraints for specific types:

```noolang
# Implement Show for Float
implement Show Float ( show = intToString );

# Implement Eq for String
implement Eq String ( 
  equals = stringEquals;
  notEquals = fn a b => not (stringEquals a b)
);

# Implement Show for Lists (if elements are showable)
implement Show (List a) given Show a (
  show = fn list => "[" + (joinStrings ", " (map show list)) + "]"
);
```

### Type-Directed Dispatch

Constraint functions automatically resolve to the correct implementation based on argument types:

```noolang
# These calls automatically resolve to the right implementation
show 42              # Uses Show Float implementation
show "hello"         # Uses Show String implementation  
show [1, 2, 3]       # Uses Show (List a) implementation with Show Float

equals 1 2           # Uses Eq Float implementation
equals "a" "b"       # Uses Eq String implementation
```

### Conditional Implementations

Implement constraints conditionally based on other constraints:

```noolang
# Show for Lists only if elements are showable
implement Show (List a) given Show a (
  show = fn list => "[" + (joinStrings ", " (map show list)) + "]"
);

# Eq for pairs if both components are comparable
implement Eq (Pair a b) given Eq a, Eq b (
  equals = fn (Pair x1 y1) (Pair x2 y2) => 
    (equals x1 x2) && (equals y1 y2)
);
```

### Error Handling

Clear error messages when implementations are missing:

```noolang
# This would produce a helpful error:
show someCustomType   # Error: No implementation of Show for CustomType
```

### Complete Example

Here's a complete example showing constraint definitions and usage at the top level:

```noolang
# Define constraints at top level
constraint Show a ( show : a -> String );
constraint Eq a ( 
  equals : a -> a -> Bool; 
  notEquals : a -> a -> Bool 
);

# Implement constraints for different types
implement Show Float ( show = toString );
implement Show String ( show = fn s => s );
implement Eq Float ( 
  equals = fn a b => a == b;
  notEquals = fn a b => a != b
);

# Use constraint functions - they resolve automatically
result1 = show 42;           # "42"
result2 = show "hello";      # "hello"
result3 = equals 1 2;        # False
result4 = notEquals 1 2;     # True
```

### Integration with Existing Features

The trait system works seamlessly with all existing Noolang features:

```noolang
# With higher-order functions
showAll = map show    # Automatically constrains to Show a => List a -> List String

# With pipeline operators
result = [1, 2, 3] |> map show |> joinStrings ", "

# With ADTs and pattern matching
type Option a = Some a | None;
implement Show (Option a) given Show a (
  show = fn opt => match opt with (
    Some x => "Some(" + show x + ")";
    None => "None"
  )
);
```

### Current Implementation Status

- ✅ **Constraint Definitions**: Full parser and AST support for `constraint Name params (functions)` at top level
- ✅ **Constraint Implementations**: Complete `implement Name Type (functions)` with conditional constraints
- ✅ **Type-Directed Dispatch**: Automatic resolution of constraint functions to implementations
- ✅ **Multiple Functions**: Support for constraints with multiple function signatures
- ✅ **Conditional Constraints**: `given` clauses for dependent implementations
- ✅ **Error Handling**: Helpful error messages for missing implementations
- ✅ **Parser Integration**: Full lexer and parser support for trait syntax
- ✅ **Type System Integration**: Complete integration with type inference and checking
- ✅ **Top-Level Support**: Constraint and implement statements work at program top level
- ✅ **Test Coverage**: Comprehensive test suite (18/18 trait system tests passing)

The trait system provides a solid foundation for advanced type system features and constraint-based programming patterns in Noolang.

## Type Constraints System

Noolang features a comprehensive **type constraint system** that enables safe and expressive generic programming. Constraints allow you to specify requirements that type variables must satisfy, similar to type classes in Haskell or traits in Rust.

### Built-in Constraints

Noolang provides several built-in constraints:

- **`Collection`** - Lists and records (not primitive types like String, Float, Bool)
- **`Number`** - Numeric types (Float)
- **`String`** - String types
- **`Boolean`** - Boolean types
- **`Show`** - Types that can be converted to strings
- **`List`** - List types specifically
- **`Record`** - Record types specifically
- **`Function`** - Function types
- **`Eq`** - Types that support equality comparison

### Constraint Syntax

TODO add examples

#### Explicit Constraint Annotations (Planned)

Future versions will support explicit constraint annotations:

```noolang
# Single constraint
id = fn x => x : a -> a given a is Collection

# Multiple constraints with "and"
map = fn f list => map f list : (a -> b, List a) -> List b given a is Show and b is Eq

# Complex constraint logic with "or"
flexible = fn x => x : a -> a given a is Collection or a is String
```

### Constraint Propagation

Constraints automatically propagate through function composition:

TODO add examples

### Constraint Validation

The type system validates constraints during unification:

TODO add examples

### Constraint Examples

#### List Operations with Constraints

TODO add examples

#### Record Operations with Constraints

TODO add examples

#### Function Composition with Constraints
TODO add examples


### Current Implementation Status

- **✅ Constraint System**: Fully implemented with Hindley-Milner style inference
- **✅ Constraint Propagation**: Constraints are properly propagated through function composition
- **✅ Built-in Constraints**: All 9 constraint types are implemented and validated
- **✅ Constraint Validation**: Type checker enforces constraints during unification
- **✅ Error Reporting**: Clear error messages when constraints are violated
- **🚧 Explicit Annotations**: `given` syntax is parsed but constraint evaluation uses AND semantics for OR constraints

### Constraint System Benefits

1. **Type Safety**: Prevents invalid operations on incompatible types
2. **Generic Programming**: Enables safe polymorphic functions with requirements
3. **Clear Error Messages**: Specific feedback about constraint violations
4. **Automatic Propagation**: Constraints flow naturally through function composition
5. **LLM-Friendly**: Clear, predictable constraint semantics

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

### Building

```bash
npm run build
```

### Performance Benchmarking

```bash
npm run benchmark
```

Runs three benchmark suites:
- **Simple**: Basic language features
- **Medium**: Recursive list operations
- **Complex**: Heavy type inference and constraint propagation

Results saved to `benchmark-results/` for historical analysis.

### VSCode Extension

```bash
npm run vscode:package  # Create extension package
```

## Language Design Decisions

#### Duck-Typed Records

- **Permissive record unification**: Any record with required fields matches
- **Accessors**: Work with any record that has the field
- **Chaining**: Accessor chains and method-chaining patterns
- **LLM-friendly**: Less rigid type constraints

### Expression-Based Design

- No statements, only expressions
- Functions are first-class values
- Immutable data structures by default
- All functions are curried by default

### Consistent Data Structures

- **Consistency**: Records, lists, and tuples all use commas
- **Familiarity**: Matches common programming language conventions
- **Flexibility**: Whitespace around commas is optional
- **Clarity**: Clear distinction between data structures and function applications

### Type System

- **Type inference**: Hindley-Milner engine
- **Primitive types**: Float, String, Bool, List, Record, Unit
- **Function types**: `(Float Float) -> Float`
- **Type constraints**: Complete constraint system
- **Type annotations**: optional

### Effects

Effects are explicit and tracked in the type system:

- **IO operations**: `!read`, `!write`, `!log`
- **State mutations**: `!state`
- **Random operations**: `!rand`
- **Effect propagation**: automatic through function composition

## Future Features

- **Enhanced type annotations**: Record type syntax
- **JavaScript compilation**: Compile to JavaScript
- **VSCode Language Server**: LSP integration

## Contributing

Feel free to fork, experiment, and contribute!

## License

MIT
# Generic ADT Constructor Fix Complete
