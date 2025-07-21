# Noolang

An functional, expression-based, LLM-friendly programming language designed for linear, declarative code with explicit effects and strong type inference.

## Features
- **Expression-based** - everything is an expression
- **Strong type inference** 
- **Type Constraints** - expressive constraint system for safe generic programming
- **Trait system** - constraint definitions and implementations with type-directed dispatch
- **Functional programming** idioms and patterns
- **Convenient operators for piping and composition** `|>` and `<|` for function composition and `|` to pipe values into partially applied functions. 
- **Composable accessors for Records** for immutably reading and writing structured data.
- **REPL** for interactive development with comprehensive debugging tools
- **Explicit effects**: Effects are tracked in the type system and visible in function types
- **Explicit Mutation**: mutable variables require special handling and can only be mutated lexically to increase safety.
- **Algebraic Data Types (ADTs)**: Complete implementation with type definitions, constructors, pattern matching, and built-in Option/Result types


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
npm run start -- --eval "1 + 2 * 3"
npm run start -- -e "x = 10; x * 2"

# Debug tokenization
npm run start -- --tokens "fn x => x + 1"
npm run start -- --tokens-file examples/demo.noo

# Debug parsing (AST)
npm run start -- --ast "if x > 0 then x else -x"
npm run start -- --ast-file examples/demo.noo

# Debug type inference
npm run start -- --types "fn x => x + 1"
npm run start -- --types-file examples/demo.noo
npm run start -- --types-detailed "fn x => x + 1"
npm run start -- --types-env "fn x => x + 1"
npm run start -- --types-ast "fn x => x + 1"

# Run files
npm run start -- examples/demo.noo
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

```noolang
# Function definition
add = fn x y => x + y

# Function application doesn't require parens and `,` is only used for separating items in data structures like `Tuple`, `Record` and `List`
add 2 3

# all functions are curried so if you pass less than their full number of arguments you get back a partially applied function
increment = add 1;
increment 2 #=> 3 : Int

# to nest calls you may need parenthesis
add 2 (add 3 2)

# strictly speaking you never pass more than one argument
add 1 2 
# is actually 
((add 1) 2)
# in javascript this could be seen as `const add = x => y => x + y; add(1)(2);`

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

# Pattern matching
type Point = Point Int Int;
point = Point 10 20;
x = match point with (Point x y => x)
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

Noolang provides a comprehensive set of built-in functions organized by category:

#### Arithmetic Operations (Pure)
- **`+`** - Addition: `Int -> Int -> Int`
- **`-`** - Subtraction: `Int -> Int -> Int` 
- **`*`** - Multiplication: `Int -> Int -> Int`
- **`/`** - Division: `Int -> Int -> Int` (throws error on division by zero)

#### Comparison Operations (Pure)
- **`==`** - Equality: `a -> a -> Bool` (polymorphic)
- **`!=`** - Inequality: `a -> a -> Bool` (polymorphic)
- **`<`** - Less than: `Int -> Int -> Bool`
- **`>`** - Greater than: `Int -> Int -> Bool`
- **`<=`** - Less than or equal: `Int -> Int -> Bool`
- **`>=`** - Greater than or equal: `Int -> Int -> Bool`

#### Function Application and Composition (Pure)
- **`|`** - Thrush operator (function application): `a -> (a -> b) -> b`
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
- **`length`** - Get list length: `List a -> Int`
- **`isEmpty`** - Check if list is empty: `List a -> Bool`
- **`append`** - Concatenate two lists: `List a -> List a -> List a`

#### Math Utilities (Pure)
- **`abs`** - Absolute value: `Int -> Int`
- **`max`** - Maximum of two numbers: `Int -> Int -> Int`
- **`min`** - Minimum of two numbers: `Int -> Int -> Int`

#### String Operations (Pure)
- **`concat`** - Concatenate strings: `String -> String -> String`
- **`toString`** - Convert value to string: `a -> String`

#### Record Operations (Pure)
- **`hasKey`** - Check if record has key: `Record -> String -> Bool`
- **`hasValue`** - Check if record has value: `Record -> a -> Bool`
- **`set`** - Set field in record: `accessor -> Record -> a -> Record`
- **Accessors** - `@field` for getting record fields: `Record -> a`

#### Tuple Operations (Pure)
- **`tupleLength`** - Get tuple length: `Tuple -> Int`
- **`tupleIsEmpty`** - Check if tuple is empty: `Tuple -> Bool`

#### I/O Operations (Effectful)
- **`print`** - Print value: `a -> a` (effect: `!write`)
- **`println`** - Print line: `a -> a` (effect: `!write`)
- **`readFile`** - Read file: `String -> String` (effect: `!read`)
- **`writeFile`** - Write file: `String -> String -> Unit` (effect: `!write`)
- **`log`** - Log message: `String -> Unit` (effect: `!log`)

#### Random Number Generation (Effectful)
- **`random`** - Random integer: `Int` (effect: `!rand`)
- **`randomRange`** - Random in range: `Int -> Int -> Int` (effect: `!rand`)

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
add = fn x y => x + y : Int -> Int -> Int

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
type Shape = Circle Int | Rectangle Int Int;
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

# Nested patterns (for complex ADTs)
match nested with (Some (Point x y) => x + y; _ => 0)

# Wildcard patterns
match color with (Red => 1; _ => 0)
```

### Type Safety

ADTs provide compile-time type safety:

- **Constructor validation**: Wrong number of arguments to constructors is caught
- **Pattern completeness**: Missing pattern cases are detected  
- **Type inference**: ADT types are inferred correctly
- **Constraint propagation**: Type constraints work with custom ADTs

### Current Implementation Status

- ✅ **Type definitions**: `type Name = Constructor1 | Constructor2`
- ✅ **Pattern matching**: `match expr with (pattern => expr; ...)`  
- ✅ **Built-in types**: Option and Result types with utility functions
- ✅ **Constructor functions**: Automatic curried constructor creation
- ✅ **Type checking**: Full type safety with inference
- ✅ **Integration**: Works with all existing language features
- ✅ **Literal patterns**: Support for matching on numbers and strings (e.g., `Code 404`)
- ✅ **Nested patterns**: Support for complex nested constructor patterns (e.g., `Wrap (Value n)`)
- ✅ **Recursive types**: Full support for recursive ADT definitions
- ✅ **Complex patterns**: Complete pattern matching with all pattern types

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

Noolang features a **comprehensive trait system** that enables constraint-based polymorphism through constraint definitions, implementations, and automatic type-directed dispatch. This provides a foundation for advanced type system features similar to Haskell's type classes or Rust's traits.

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
# Implement Show for Int
implement Show Int ( show = intToString );

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
show 42              # Uses Show Int implementation
show "hello"         # Uses Show String implementation  
show [1, 2, 3]       # Uses Show (List a) implementation with Show Int

equals 1 2           # Uses Eq Int implementation
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

- ✅ **Constraint Definitions**: Full parser and AST support for `constraint Name params (functions)`
- ✅ **Constraint Implementations**: Complete `implement Name Type (functions)` with conditional constraints
- ✅ **Type-Directed Dispatch**: Automatic resolution of constraint functions to implementations
- ✅ **Multiple Functions**: Support for constraints with multiple function signatures
- ✅ **Conditional Constraints**: `given` clauses for dependent implementations
- ✅ **Error Handling**: Helpful error messages for missing implementations
- ✅ **Parser Integration**: Full lexer and parser support for trait syntax
- ✅ **Type System Integration**: Complete integration with type inference and checking
- ✅ **Test Coverage**: Comprehensive test suite (14/14 trait system tests passing)

The trait system provides a solid foundation for advanced type system features and constraint-based programming patterns in Noolang.

## Type Constraints System

Noolang features a comprehensive **type constraint system** that enables safe and expressive generic programming. Constraints allow you to specify requirements that type variables must satisfy, similar to type classes in Haskell or traits in Rust.

### Built-in Constraints

Noolang provides several built-in constraints:

- **`Collection`** - Lists and records (not primitive types like String, Int, Bool)
- **`Number`** - Numeric types (Int)
- **`String`** - String types
- **`Boolean`** - Boolean types
- **`Show`** - Types that can be converted to strings
- **`List`** - List types specifically
- **`Record`** - Record types specifically
- **`Function`** - Function types
- **`Eq`** - Types that support equality comparison

### Constraint Syntax

#### Automatic Constraints (Current Implementation)

Many built-in functions automatically carry constraints that are enforced during type checking:

```noolang
# head function has constraint: (List a) -> a given a is Collection
first = head [1, 2, 3];  # ✅ Works - Int satisfies Collection
first_bad = head 42;     # ❌ Error - Int does not satisfy Collection

# tail function has same constraint
rest = tail [1, 2, 3];   # ✅ Works
rest_bad = tail "hello"; # ❌ Error - String does not satisfy Collection

# length function works on any Collection
count = length [1, 2, 3]; # ✅ Works
```

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

```noolang
# Compose functions while preserving constraints
compose = fn f g => fn x => f (g x)

# head has constraint: a is Collection
# compose preserves this constraint
safeHead = compose head

# This works because list satisfies Collection constraint
result = safeHead [1, 2, 3];  # ✅ Type: Int

# This fails because Int doesn't satisfy Collection constraint
bad_result = safeHead 42;     # ❌ Type error
```

### Constraint Validation

The type system validates constraints during unification:

```noolang
# Function that requires Collection constraint
processList = fn x => head x : a -> b given a is Collection

# Valid usage
result1 = processList [1, 2, 3];  # ✅ Works

# Invalid usage - constraint violation
result2 = processList 42;         # ❌ Error: Int does not satisfy Collection constraint
```

### Constraint Examples

#### List Operations with Constraints

```noolang
# All list operations require Collection constraint
numbers = [1, 2, 3, 4, 5];

first = head numbers;     # Type: Int
rest = tail numbers;      # Type: List Int
count = length numbers;   # Type: Int

# Constraint propagation through composition
getFirst = compose head;
result = getFirst numbers;  # Type: Int
```

#### Record Operations with Constraints

```noolang
# Records also satisfy Collection constraint
person = { @name "Alice", @age 30 };

# Accessors work with any record having the required field
name = @name person;      # Type: String
age = @age person;        # Type: Int

# Constraint validation ensures type safety
bad_access = @nonexistent person;  # ❌ Error if field doesn't exist
```

#### Function Composition with Constraints

```noolang
# Compose functions while maintaining constraint safety
compose = fn f g => fn x => f (g x)

# Create safe list operations
safeHead = compose head;
safeTail = compose tail;

# These work because constraints are preserved
first = safeHead [1, 2, 3];  # ✅ Type: Int
rest = safeTail [1, 2, 3];   # ✅ Type: List Int

# These fail because constraints are enforced
bad_first = safeHead 42;     # ❌ Error: Int does not satisfy Collection
```

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

All 316 tests pass, including parser, evaluator, typer, ADTs, constraints, recursion, and effects tests. The functional typer is used exclusively.

### Building

```bash
npm run build
```

### Performance Benchmarking

Noolang includes a comprehensive benchmarking system to track performance as language features are added:

```bash
npm run benchmark
```

This runs three benchmark suites:
- **Simple**: Basic language features (factorial, fibonacci) 
- **Medium**: Recursive list operations and higher-order functions
- **Complex**: Heavy type inference, constraint propagation, and nested computations

Results are automatically saved with git commit tracking to `benchmark-results/` for historical analysis.

**Benchmark files:**
- `benchmarks/simple.noo` - Basic arithmetic and recursion
- `benchmarks/medium.noo` - List operations with manual implementations  
- `benchmarks/complex.noo` - Complex nested functions and record operations

The benchmark runner provides statistical analysis (min/max/avg/median) across multiple runs with warmup phases to eliminate cold start effects.

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
- **Type constraints**: Complete constraint system with automatic propagation and validation
- **Type annotations** (planned for future versions)

### Effects (Implemented)

Effects are explicit and fully tracked in the type system:

- **IO operations** are marked with `!read`, `!write`, `!log`
- **State mutations** are tracked with `!state`
- **Random operations** are marked with `!rand`
- **All effects** propagate through function composition automatically
- **Effect validation** ensures type safety and explicit effect handling

## Future Features

- **Enhanced type annotations**: Record type syntax `{@name String, @age Number}`
- **Constraint annotations**: Explicit `given` syntax for constraint declarations
- **File imports**: Module system for code organization  
- **Destructuring patterns**: Pattern-based assignment for tuples and records
- **JavaScript compilation**: Compile to JavaScript for production use
- **VSCode Language Server**: LSP integration for intellisense and hover types
- **Show constraints**: Add `Show` constraint to `print` function for type safety

## Contributing

This is a learning project for building programming languages. Feel free to experiment and contribute!

## License

MIT
