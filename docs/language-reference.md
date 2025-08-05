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
123.456     # Decimal numbers
```

### Strings
```noolang
"Hello, World!";
"String with spaces";
""          # Empty string
```

### Booleans
```noolang
True;
False
```

### Lists
```noolang
[];              # Empty list
[1, 2, 3];       # List of numbers  
["a", "b"];      # List of strings
[1, 2, 3, 4]    # Comma separators
```

### Records
```noolang
{};                              # Empty record
{ @name "Alice", @age 30 };      # Record with fields
{ @x 1, @y 2, @z 3 }           # Multi-field record
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
myMap = fn f list => map f list
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
person = createPerson "Alice" 30 "Engineer"
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
userName = user | @name             # Get field from record
```

#### Function Composition (`|>`)
```noolang
# Composes functions left-to-right
addOne = fn x => x + 1;
square = fn x => x * x;
composed = addOne |> square;    # fn x => square (addOne x)

# Use composed function
result = 5 | composed             # square (addOne 5) = 36
```

#### Safe Pipe (`|?`)
```noolang
# Works with Option/Result types
someValue = Some 12;
divided = match someValue with (Some x => x / 2; None => None);
multiplied = match divided with (Some x => Some (x * 3); None => None);
multiplied
```

#### Dollar Operator (`$`)
```noolang
# Low precedence function application
double = fn x => x * 2;
addTen = fn x => x + 10;
result = addTen $ double $ 5
# Equivalent to: addTen (double 5)
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
       else "zero"
```

### Local Bindings

Local bindings are created using expression sequencing with semicolons:

```noolang
# Local bindings using semicolons
result = (x = 5; y = 10; x + y * 2);

# More complex example  
x = 6;
z = 9;
calculation = (base = x * 2; helper = 3; base + helper)
```

### Record Operations
```noolang
# Record creation
person = { @name "Alice", @age 30, @city "NYC" };

# Field access
name = person.name;

# Record with computed fields
point = { @x 1 + 2, @y 3 * 4 };
point
```

### Accessor Patterns
```noolang
# Define accessor
nameAccessor = fn record => record.name;

# Use accessor in pipeline
person = { @name "Alice", @age 30 };
result = person | nameAccessor;
result
```

## Type Annotations (Planned)

While type inference handles most cases, explicit annotations will be supported:

```noolang
# Function with type annotation
add : Float -> Float -> Float
add = fn x y => x + y

# Variable with type
count : Float = 42
```

## Comments

```noolang
# Single line comment
x = 5  # End of line comment

# Comments can contain any text
# TODO: implement feature
# NOTE: this is important
```

## Import System

```noolang
# Import from file
import "math.noo"
import "utils/helpers.noo"

# Imported names become available in scope
result = math.sqrt 16
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
8. Dollar operator (`$`) - lowest precedence

## Whitespace and Layout

- Whitespace is generally ignored between tokens
- Newlines can separate expressions  
- Indentation is not significant (unlike Python/Haskell)
- Semicolons separate list elements

## Error Expressions

The language includes robust error handling with built-in types:

```noolang
# Division already returns Option Float for safety
result1 = 10 / 2    # Some 5.0
result2 = 10 / 0    # None

# Option types for nullable values (built-in)
head [1, 2, 3]      # Some 1
head []             # None

# Result types for error handling (built-in)
parseResult = parseFloat "42"    # Ok 42
parseError = parseFloat "abc"    # Err "Invalid number"
```

## Next Steps

- **Type System**: Read [Type System Guide](type-system-guide.md) for details on inference and constraints
- **Standard Library**: See [`stdlib.noo`](../stdlib.noo) for built-in functions and traits
- **Examples**: Check [Examples & Tutorials](examples-and-tutorials.md) for practical usage patterns