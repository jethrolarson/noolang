---
assert: true
---

# Noolang Type System

> Complete guide to Noolang's type system, inference, and constraints

Noolang features a powerful type system based on Hindley-Milner type inference with constraint-based polymorphism. The system emphasizes type safety while minimizing the need for explicit type annotations.

## Type Inference

Noolang automatically infers types for most expressions, eliminating the need for verbose type annotations while maintaining complete type safety.

### Basic Type Inference

```noolang
# Types are automatically inferred
x = 42;              # => 42 : Float
name = "Alice";      # => "Alice" : String
flag = True;         # => True : Bool
numbers = [1, 2, 3]; # => [1, 2, 3] : List Float
```

### Function Type Inference

Function types are inferred from their definitions and usage:

```noolang
# Function types inferred from body
double = fn x => x * 2;     # => <function> : Float -> Float
addTwo = fn x y => x + y;   # => <function> : a -> a -> a given a implements Add

# Higher-order functions
applyFn = fn f x => f x;    # => <function> : (a -> b) -> a -> b
```

### Polymorphic Functions

The type system supports let-polymorphism, allowing functions to work with multiple types:

```noolang
# Polymorphic identity function
identity = fn x => x;       # => <function> : a -> a

# Works with any type
stringId = identity "hello"; # => "hello" : String
numberId = identity 42;      # => 42 : Float
boolId = identity True;      # => True : Bool
```

## Built-in Types

### Primitive Types

Noolang provides several fundamental types:

- **`Float`**: Floating-point numbers (`42`, `3.14`, `-1.5`)
- **`String`**: Text strings (`"hello"`, "world")
- **`Bool`**: Boolean values (`True`, `False`)
- **`Unit`**: The unit type representing empty values

### Collection Types

```noolang
# Lists - homogeneous collections
numbers = [1, 2, 3, 4];     # => [1, 2, 3, 4] : List Float
names = ["Alice", "Bob"];   # => ["Alice", "Bob"] : List String
empty = [];                 # => [] : List a

# Records - structured data with named fields
person = { @name "Alice", @age 30 };  # => {@name "Alice", @age 30} : { @name String, @age Float }
point = { @x 10, @y 20 };             # => {@x 10, @y 20} : { @x Float, @y Float }
```

### Option Types

The built-in `Option` type represents values that may or may not exist:

```noolang
# Division returns Option Float for safety
result1 = 10 / 2;        # => Some 5 : Option Float
result2 = 10 / 0;        # => None : Option Float

# Working with Option values
maybeFirst = head [1, 2, 3];  # => Some 1 : Option Float
maybeSecond = at 1 [1, 2, 3]; # => Some 2 : Option Float
maybeEmpty = head [];          # => None : Option a
```

## Constraint System

Noolang's constraint system enables safe, type-driven polymorphism through automatic constraint resolution.

### Built-in Constraints

The standard library provides several working constraints:

#### Show Constraint

The `Show` constraint enables converting values to strings:

```noolang
# show works for many built-in types
numberStr = show 42;           # => "42" : String
stringStr = show "hello";      # => "hello" : String
boolStr = show True;           # => "True" : String
listStr = show [1, 2, 3];      # => "[1, 2, 3]" : String
optionStr = show (Some 42);    # => "Some(42)" : String
```

#### Functor Constraint

The `Functor` constraint enables mapping functions over container types:

```noolang
# map works with Lists
doubled = map (fn x => x * 2) [1, 2, 3];    # => [2, 4, 6] : List Float
strings = map show [1, 2, 3];               # => ["1", "2", "3"] : List String

# map works with Option
incremented = map (fn x => x + 1) (Some 5); # => Some 6 : Option Float
nothingMapped = map (fn x => x + 1) None;   # => None : Option Float
```

### Constraint Inference

Constraints are automatically inferred and propagated through function composition:

```noolang
# Constraint inference in action
double = fn x => x * 2;
showDoubled = fn x => show (double x);  # => <function> : Float -> String

# automatically uses Show constraint
result = showDoubled 21;  # => "42" : String
```

### Polymorphic Constraints

Functions can work polymorphically with any type that satisfies required constraints:

```noolang
# Works with any type that has Show
showAll = map show;

# Automatically gets constrained type: Show a => List a -> List String
numberStrings = showAll [1, 2, 3];        # => ["1", "2", "3"] : List String
boolStrings = showAll [True, False];      # => ["True", "False"] : List String
```

#### Eq Constraint

The `Eq` constraint enables equality comparison. `equals` and `==` work on
Float, String, Bool, Option, Result, and List:

```noolang
# Eq for primitive types
equals 1.0 1.0;          # => True : Bool
equals "hello" "world";  # => False : Bool
1.0 == 1.0;              # => True : Bool
"a" == "b";              # => False : Bool
```

```noolang
# Eq for Option, Result, List
equals (Some 1.0) (Some 1.0);    # => True : Bool
equals None (Some 1.0);          # => False : Bool
equals (Ok 1.0) (Ok 1.0);        # => True : Bool
equals [1.0, 2.0] [1.0, 2.0];   # => True : Bool
```

#### Ord Constraint

The `Ord` constraint provides ordering operators `<`, `>`, `<=`, and `>=`.
These are polymorphic over Float and String:

```noolang
# Ord for Float
2.0 < 3.0;     # => True : Bool
3.0 > 2.0;     # => True : Bool
1.0 <= 1.0;    # => True : Bool
2.0 >= 1.0;    # => True : Bool
```

```noolang
# Ord for String (lexicographic)
"a" < "b";     # => True : Bool
"b" > "a";     # => True : Bool
"abc" <= "abd"; # => True : Bool
```

### Effect Inference and Enforcement

Effects are automatically inferred into function types. A function that calls
`print` or `println` gets effect `!write`; `readFile` adds `!read`; `log`
adds `!log`, and so on. Effects propagate through function composition.

```noolang
# Effect is inferred — no annotation needed
printTwice = fn x => (print x; print x);  # => <function> : a -> {} !write
printTwice "hello"  # => {} : {}
```

When you add an explicit type annotation, it is **checked against the inferred
effects**:

- You **may** declare more effects than the body performs (over-declaration is
  allowed for forward-compatibility).
- You **must not** omit an effect the body actually performs.

```noolang
# Over-declaring is allowed — annotation adds !read even though body only writes
verbose = fn x => print x : String -> {} !write !read;  # => <function> : String -> {} !write !read
verbose "ok"  # => {} : {}
```

The following would be a type error (annotation omits `!write`):

```
# TypeError: Type annotation omits effect !write performed by the expression
bad = fn x => print x : String -> {};
```

## Type System Integration

### Pipeline Operators

The type system works seamlessly with Noolang's pipeline operators:

```noolang
# Types flow through function application
doubled = map (fn x => x * 2) [1, 2, 3];      # => [2, 4, 6] : List Float
strings = map show doubled;                     # => ["2", "4", "6"] : List String
result = head strings;                          # => Some "2" : Option String

# Function composition preserves types
double = fn x => x * 2;
increment = fn x => x + 1;
composed = double |> increment;  # => <function> : Float -> Float
```

### Error Handling with Option

The type system integrates with Option types for safe error handling:

```noolang
# Safe operations return Option types
safeHead = head [1, 2, 3];  # => Some 1 : Option Float
safeDiv = 10 / 2;           # => Some 5 : Option Float
unsafeDiv = 10 / 0;         # => None : Option Float

# Type system supports Option types
result = safeHead;  # => Some 1 : Option Float
show result;  # => "Some(1)" : String
```

## Type Annotations (Optional)

While type inference handles most cases, you can provide explicit type annotations when needed:

```noolang
# Explicit function types (for documentation)
addTwo = fn x y => x + y;    # => <function> : a -> a -> a given a implements Add

# Variable type hints (for clarity)
count = 42;                  # => 42 : Float
count;                       # => 42 : Float
```

## Type Definition Rules

- Defining a `variant` or `type` with a name that already exists is an error.
- Reserved names: `Float`, `String`, `Unit`, `List` cannot be redefined.
- Standard library ADTs (e.g., `Bool`, `Option`, `Result`) are considered existing type names.
- Duplicate user-defined type names in the same program/session are errors.

## Working with the Type System

### REPL Type Inspection

The REPL shows inferred types for all expressions:

```
noolang> fn x => x * 2
(fn x => x * 2)
Type: Float -> Float

noolang> map (fn x => x + 1)
(fn list => map (fn x => x + 1) list)
Type: List Float -> List Float
```

### Type-Driven Development

Use the type system to guide development:

1. **Start with examples**: Write working code with concrete values
2. **Observe inferred types**: Check what the type system infers
3. **Extract patterns**: Factor out common operations into functions
4. **Leverage constraints**: Use polymorphic functions with constraints

### Common Patterns

```noolang
# Type-safe data transformation
processData = fn items =>
  map show (map (fn x => x * 2) items);

# Safe property access with records
person = { @name "Alice", @age 30 };  # => {@name "Alice", @age 30} : { @name String, @age Float }
person;  # => {@name "Alice", @age 30} : { @name String, @age Float }
```

## Advanced Features

### Constraint Propagation

Constraints automatically propagate through function composition:

```noolang
# Functions automatically inherit required constraints
showAndDouble = fn x => show (x * 2);  # => <function> : Float -> String
mapShowAndDouble = map showAndDouble;

# Constraint requirements are checked at compile time
validUsage = mapShowAndDouble [1, 2, 3];  # => ["2", "4", "6"] : List String
```

### Polymorphic Data Structures

Work with polymorphic collections safely:

```noolang
# Generic operations on lists
first = head [1, 2, 3];     # => Some 1 : Option Float
empty = head [];            # => None : Option a

# Working with Option results
result = first;  # => Some 1 : Option Float
result;  # => Some 1 : Option Float
```

## Type System Limitations

### Current Limitations

- **Field Access**: Direct field access syntax (`.field`) not yet implemented
- **Type Annotations**: Full type annotation syntax still in development
- **Custom Constraints**: User-defined constraints not yet supported
- **Import Types**: Module system type integration still being designed

### Workarounds

```noolang
# Instead of direct field access
# person.name  # Not yet supported

# Use pattern matching
getName = fn person => match person (
  { @name n, @age _ } => n;
  _ => "Unknown"
);
```

## Best Practices

### 1. Trust Type Inference

Let the type system infer types automatically:

```noolang
# Good: Let inference work
transform = fn items => map (fn x => x * 2) items;

# Unnecessary: Over-specifying types
# transform = fn items => map (fn x => x * 2) items : List Float -> List Float;
```

### 2. Use Constraints Effectively

Leverage the constraint system for polymorphic code:

```noolang
# Good: Polymorphic with constraints
debug = fn value => "Debug: " + show value;

# Limited: Concrete types only
debugFloat = fn value => "Debug: " + show value;  # Only works with Float
```

### 3. Pattern Matching for Safety

Use pattern matching for safe data access:

```noolang
# Good: Work with structured data
createPerson = fn name age => { @name name, @age age };
alice = createPerson "Alice" 30;

# Risky: Direct access (when implemented)
# unsafeAge = person.age;  # Could fail if field missing
```

### 4. Leverage Pipeline Types

Use pipelines for clear type flow:

```noolang
# Good: Function composition
process = fn x => x * 2;
format = show;
composed = process |> format;  # => <function> : Float -> String

# Apply composed function
result = composed 21;  # => "42" : String
```

## Next Steps

- **Language Reference**: See [Language Reference](language-reference.md) for complete syntax details
- **Examples**: Check [Examples & Tutorials](examples-and-tutorials.md) for practical usage patterns
- **Standard Library**: Explore [`stdlib.noo`](../stdlib.noo) for available constraints and functions
- **REPL**: Use `bun start` to experiment with type inference interactively