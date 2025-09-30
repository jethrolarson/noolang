# Noolang Language Reference

> Complete reference for Noolang syntax, operators, and language constructs.

## Source Code References

- **Lexer**: [`src/lexer/lexer.ts`](../src/lexer/lexer.ts) - Token definitions and parsing
- **Parser**: [`src/parser/`](../src/parser/) - Syntax parsing and AST construction
- **AST**: [`src/ast.ts`](../src/ast.ts) - Abstract syntax tree node definitions
- **Tests**: [`src/lexer/__tests__/`](../src/lexer/__tests__/) - Comprehensive language feature tests

## Literals

### Numbers

```noolang
42;          # Integer
3.14159;     # Float
123.456;     # Decimal numbers
```

### Strings

```noolang
"Hello, World!";
"String with spaces";
"";          # Empty string
```

### Booleans

```noolang
True;
False;
```

### Lists

```noolang
[];              # Empty list
[1, 2, 3];       # List of numbers
["a", "b"];      # List of strings

# Safe element access (index, list) -> Option
at 0 [10, 20, 30];   # Some 10
at 3 [10, 20, 30];   # None
```

### Records

```noolang
{};                              # Empty record
{ @name "Alice", @age 30 };      # Record with fields
{ @x 1, @y 2, @z 3 };           # Multi-field record
```

## Keywords

All keywords supported by the lexer ([`src/lexer/lexer.ts:147-176`](../src/lexer/lexer.ts#L147-L176)):

### Control Flow

- `if` `then` `else` - Conditional expressions
- `match` `with` - Pattern matching (planned)

### Function Definition

- `fn` - Function definition

- `;` - Expression sequencing for local bindings

### Type System

- `type` - Type definitions
- `variant` - Algebraic data type definitions
- `constraint` - Trait/constraint definitions
- `implement` `implements` - Trait implementations
- `given` `is` `has` - Constraint expressions

### Effects & Mutation

- `mut` - Mutable variable declaration
- `mut!` - Special mutation syntax

### Imports

- `import` - Module imports

### Logical Operators

- `and` `or` - Logical conjunction/disjunction

### Type Names

- `Float` `String` `Unit` `List` - Built-in type names

## Operators

All operators from the lexer ([`src/lexer/lexer.ts:191-211`](../src/lexer/lexer.ts#L191-L211)):

### Pipeline Operators

```
|     # Pipe (thrush): x | f ≡ f x (applies value to function)
|>    # Function composition: f |> g ≡ fn x => g (f x)
<|    # Reverse composition: g <| f ≡ fn x => g (f x)
|?    # Safe pipe for Option/Result types
$     # Low-precedence application: f $ x ≡ f x
```

### Arithmetic Operators

```
+     # Addition
-     # Subtraction
*     # Multiplication
/     # Division
%     # Modulus
```

### Comparison Operators

```
==    # Equality
!=    # Inequality
<     # Less than
>     # Greater than
<=    # Less than or equal
>=    # Greater than or equal
```

### Assignment & Arrows

```
=     # Assignment/binding
=>    # Function arrow (lambda)
->    # Type arrow
```

## Punctuation

Special characters ([`src/lexer/lexer.ts:237-242`](../src/lexer/lexer.ts#L237-L242)):

```
( )   # Parentheses for grouping
[ ]   # List literals
{ }   # Record literals
;     # Expression sequencing
,     # Field/parameter separators
.     # Record field access
@     # Accessor prefix
#     # Comments
```

## Built-in Functions

Noolang provides a comprehensive set of built-in functions for common operations, I/O, and system interaction.

### System Operations

#### Process Execution

The `exec` function enables type-safe shell command execution, returning a `Result` type for proper error handling.

```noolang
# Type signature: String -> List String -> Result String ExecError
exec : String -> List String -> Result String ExecError
```

**Basic Usage:**

```noolang
# Execute a simple command
result = exec "echo" ["hello world"];
match result (
    Ok output => println output;    # Prints: hello world
    Err error => println error      # Handle execution errors
)
```

**Working with Command Arguments:**

```noolang
# Execute commands with multiple arguments
lsResult = exec "ls" ["-la", "/tmp"];
match lsResult (
    Ok output => println ("Directory listing:\n" + output);
    Err error => println ("Failed to list directory: " + error)
)
```

**Practical Automation Examples:**

```noolang
# Get current user and date
getUserInfo = fn => 
    match exec "whoami" [] (
        Ok user => match exec "date" [] (
            Ok date => Ok (user + " at " + date);
            Err error => Err ("Date failed: " + error)
        );
        Err error => Err ("User lookup failed: " + error)
    );

# Use the automation function
userInfo = getUserInfo ();
match userInfo (
    Ok info => println ("Current session: " + info);
    Err error => println ("System info error: " + error)
)
```

**Error Handling:**

```noolang
# Handle command failures gracefully
result = exec "nonexistentcommand" [];
match result (
    Ok output => println "This won't execute";
    Err error => println "Expected error: Command not found"
)
```

**Type Safety:**

All arguments must be strings, and the result is always wrapped in a `Result` type:

```noolang
# ✓ Valid usage
exec "echo" ["arg1", "arg2"]

# ✗ Type error - non-string arguments
exec "echo" [123]

# ✗ Type error - non-list arguments  
exec "echo" "single-string"
```

### I/O Operations

#### Console Output

```noolang
# Print with newline
println "Hello World!";
println 42;

# Print without newline  
print "Processing... ";
print "Done!";
```

#### File Operations

```noolang
# Read file contents
content = readFile "example.txt";
println content;

# Write to file
writeFile "output.txt" "Hello from Noolang!";
```

#### Logging

```noolang
# Write to log
log "Application started";
log ("User count: " + toString userCount);
```

### Utility Functions

#### Type Conversion

```noolang
# Convert any value to string representation
toString 42;        # "42"
toString True;      # "True" 
toString [1, 2, 3]; # "[1, 2, 3]"

# Type erasure (convert to Unknown type)
forget 42;          # Unknown value
```

#### String Operations

```noolang
# String concatenation
concat "Hello" " World";   # "Hello World"
```

#### Mathematical Functions

```noolang
# Absolute value
abs (-5);    # 5

# Min/Max
min 3 7;     # 3
max 3 7;     # 7
```

#### Random Number Generation

```noolang
# Random float between 0 and 1
randomValue = random;

# Random float in range
randomInRange = randomRange 1.0 100.0;
```

## Expressions

### Function Definition

```noolang
# Simple function
addTwo = fn x y => x + y;

# Single parameter
double = fn x => x * 2;

# No parameters
getMessage = fn => "Hello!";

# Higher-order function
myMap = fn f list => map f list;
```

### Function Application

```noolang
# Direct application
addTwo = fn x y => x + y;
result1 = addTwo 5 3;

# Partial application
add5 = addTwo 5;
result2 = add5 10;     # Results in 15

# Multiple arguments
createPerson = fn name age job => { @name name, @age age, @job job };
person = createPerson "Alice" 30 "Engineer";
```

### Pipeline Operators in Detail

#### Pipe Operator (`|`)

```noolang
# Applies value to function (thrush)
addThree = fn x => x + 3;
multiplyTwo = fn x => x * 2;
5 | addThree | multiplyTwo;    # multiplyTwo (addThree 5) = 16

# Data transformation with function application (pipe with map is broken)
doubled = map (fn x => x * 2) [1, 2, 3];
result = head doubled;

# Field access with pipe
user = { @name "Alice", @age 30 };
userName = user | @name;             # Get field from record
```

#### Function Composition (`|>`)

```noolang
# Composes functions left-to-right
addOne = fn x => x + 1;
square = fn x => x * x;
composed = addOne |> square;    # fn x => square (addOne x)

# Use composed function
result = 5 | composed;             # square (addOne 5) = 36
```

#### Safe Pipe (`|?`)

```noolang
# Works with Option/Result types
divideByTwo = fn x => x / 2;
multiplyByThree = fn x => x * 3;
Some 12 |? divideByTwo |? multiplyByThree;
```



### Conditional Expressions

```noolang
# Basic conditional
x = 5;
result = if x > 0 then "positive" else "non-positive";

# Nested conditionals
y = -3;
sign = if y > 0 then "positive"
       else if y < 0 then "negative"
       else "zero";
```

### Local Bindings

Local bindings are created using expression sequencing with semicolons:

```noolang
# Local bindings using semicolons
result = (x = 5; y = 10; x + y * 2);

# More complex example
x = 6;
z = 9;
calculation = (base = x * 2; helper = 3; base + helper);
```

### Record Operations

```noolang
# Record creation
person = { @name "Alice", @age 30, @city "NYC" };

# Record with computed fields
{ @x 1 + 2, @y 3 * 4 };
```

### Accessor Patterns

```noolang
# Simple record operations
{ @name "Alice", @age 30 };
```

## Type Names and Shadowing

- Type names are global and cannot be redefined. Defining a `variant` or `type` with a name that already exists is a type error.
- Built-in syntactic type names (`Float`, `String`, `Unit`, `List`) are always reserved.
- Standard library ADTs (e.g., `Bool`, `Option`, `Result`) are loaded by default and are treated as existing type names.

Notes:

- Constructors and types share the type namespace for shadowing checks.
- Value-level shadowing rules are unchanged.

## Comments

```noolang
# Single line comment
x = 5;  # End of line comment

# Comments can contain any text
# TODO: implement feature
# NOTE: this is important
```

## Import System

```noolang
# Import system is planned but not yet implemented
# Currently all stdlib functions are available globally
result = show 42;
```

## Operator Precedence

From highest to lowest precedence (based on parser implementation):

1. Function application (left-associative)
2. Unary operators (`-`)
3. Multiplicative (`*`, `/`, `%`)
4. Additive (`+`, `-`)
5. Comparison (`<`, `>`, `<=`, `>=`, `==`, `!=`)
6. Logical (`and`, `or`)
7. Pipeline (`|>`, `<|`, `|`, `|?`)
8. Pipeline (`|>`, `<|`, `|`, `|?`) - lowest precedence

## Whitespace and Layout

- Whitespace is generally ignored between tokens
- Newlines can separate expressions
- Indentation is not significant (unlike Python/Haskell)
- Semicolons separate list elements

## Error Expressions

The language includes robust error handling with built-in types:

```noolang
# Division already returns Option Float for safety
result1 = 10 / 2;
result2 = 10 / 0;

# Option types for nullable values (built-in)
option1 = head [1, 2, 3];
option2 = head [];

# Show the results
show result1;
```

## Next Steps

- **Type System**: Read [Type System Guide](type-system-guide.md) for details on inference and constraints
- **Standard Library**: See [`stdlib.noo`](../stdlib.noo) for built-in functions and traits
- **Examples**: Check [Examples & Tutorials](examples-and-tutorials.md) for practical usage patterns
