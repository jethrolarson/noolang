# Noolang Type System

> Complete guide to Noolang's type system, inference, and constraints

Noolang features a powerful type system based on Hindley-Milner type inference with constraint-based polymorphism. The system emphasizes type safety while minimizing the need for explicit type annotations.

## Type Inference

Noolang automatically infers types for most expressions, eliminating the need for verbose type annotations while maintaining complete type safety.

### Basic Type Inference

```noolang
# Types are automatically inferred
x = 42;              # x: Float
name = "Alice";      # name: String
flag = True;         # flag: Bool
numbers = [1, 2, 3]; # numbers: List Float
```

### Function Type Inference

Function types are inferred from their definitions and usage:

```noolang
# Function types inferred from body
double = fn x => x * 2;     # double: Float -> Float
addTwo = fn x y => x + y;   # addTwo: Float -> Float -> Float

# Higher-order functions
applyFn = fn f x => f x;    # applyFn: (a -> b) -> a -> b
```

### Polymorphic Functions

The type system supports let-polymorphism, allowing functions to work with multiple types:

```noolang
# Polymorphic identity function
identity = fn x => x;       # identity: a -> a

# Works with any type
stringId = identity "hello"; # "hello"
numberId = identity 42;      # 42
boolId = identity True;      # True
```

## Built-in Types

### Primitive Types

Noolang provides several fundamental types:

- **`Float`**: Floating-point numbers (`42`, `3.14`, `-1.5`)
- **`String`**: Text strings (`"hello"`, `"world"`)
- **`Bool`**: Boolean values (`True`, `False`)
- **`Unit`**: The unit type representing empty values

### Collection Types

```noolang
# Lists - homogeneous collections
numbers = [1, 2, 3, 4];     # List Float
names = ["Alice", "Bob"];   # List String
empty = [];                 # List a (polymorphic empty list)

# Records - structured data with named fields
person = { @name "Alice", @age 30 };  # { @name String, @age Float }
point = { @x 10, @y 20 };             # { @x Float, @y Float }
```

### Option Types

The built-in `Option` type represents values that may or may not exist:

```noolang
# Division returns Option Float for safety
result1 = 10 / 2;        # Some 5.0
result2 = 10 / 0;        # None

# Working with Option values
maybeFirst = head [1, 2, 3];  # Some 1
maybeSecond = at 1 [1, 2, 3]; # Some 2
maybeEmpty = head [];          # None
```

## Constraint System

Noolang's constraint system enables safe, type-driven polymorphism through automatic constraint resolution.

### Built-in Constraints

The standard library provides several working constraints:

#### Show Constraint

The `Show` constraint enables converting values to strings:

```noolang
# show works for many built-in types
numberStr = show 42;           # "42"
stringStr = show "hello";      # "hello"
boolStr = show True;           # "True"
listStr = show [1, 2, 3];      # "[1, 2, 3]"
optionStr = show (Some 42);    # "Some(42)"
```

#### Functor Constraint

The `Functor` constraint enables mapping functions over container types:

```noolang
# map works with Lists
doubled = map (fn x => x * 2) [1, 2, 3];    # [2, 4, 6]
strings = map show [1, 2, 3];               # ["1", "2", "3"]

# map works with Option
incremented = map (fn x => x + 1) (Some 5); # Some 6
nothingMapped = map (fn x => x + 1) None;   # None
```

### Constraint Inference

Constraints are automatically inferred and propagated through function composition:

```noolang
# Constraint inference in action
double = fn x => x * 2;
showDoubled = fn x => show (double x);

# Type: Float -> String (automatically uses Show constraint)
result = showDoubled 21;  # "42"
```

### Polymorphic Constraints

Functions can work polymorphically with any type that satisfies required constraints:

```noolang
# Works with any type that has Show
showAll = map show;

# Automatically gets constrained type: Show a => List a -> List String
numberStrings = showAll [1, 2, 3];        # ["1", "2", "3"]
boolStrings = showAll [True, False];      # ["True", "False"]
```

## Type System Integration

### Pipeline Operators

The type system works seamlessly with Noolang's pipeline operators:

```noolang
# Types flow through function application
doubled = map (fn x => x * 2) [1, 2, 3];      # List Float
strings = map show doubled;                     # List String
result = head strings;                          # Option String

# Function composition preserves types
double = fn x => x * 2;
increment = fn x => x + 1;
composed = double |> increment;  # Float -> Float
result
```

### Error Handling with Option

The type system integrates with Option types for safe error handling:

```noolang
# Safe operations return Option types
safeHead = head [1, 2, 3];  # Some 1
safeDiv = 10 / 2;           # Some 5.0
unsafeDiv = 10 / 0;         # None

# Type system supports Option types
result = safeHead;  # Option Float
show result
```

## Type Annotations (Optional)

While type inference handles most cases, you can provide explicit type annotations when needed:

```noolang
# Explicit function types (for documentation)
addTwo = fn x y => x + y;    # Inferred: Float -> Float -> Float

# Variable type hints (for clarity)
count = 42;                  # Inferred: Float
count                        # count: Float
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
person = { @name "Alice", @age 30 };
person
```

## Advanced Features

### Constraint Propagation

Constraints automatically propagate through function composition:

```noolang
# Functions automatically inherit required constraints
showAndDouble = fn x => show (x * 2);  # Float -> String
mapShowAndDouble = map showAndDouble;   # List Float -> List String

# Constraint requirements are checked at compile time
validUsage = mapShowAndDouble [1, 2, 3];  # ✅ Works
```

### Polymorphic Data Structures

Work with polymorphic collections safely:

```noolang
# Generic operations on lists
first = head [1, 2, 3];     # Some 1
empty = head [];            # None

# Working with Option results
result = first;
result
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
getName = fn person => match person with (
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
composed = process |> format;  # Float -> String

# Apply composed function
result = composed 21;  # "42"
```

## Next Steps

- **Language Reference**: See [Language Reference](language-reference.md) for complete syntax details
- **Examples**: Check [Examples & Tutorials](examples-and-tutorials.md) for practical usage patterns
- **Standard Library**: Explore [`stdlib.noo`](../stdlib.noo) for available constraints and functions
- **REPL**: Use `bun start` to experiment with type inference interactively