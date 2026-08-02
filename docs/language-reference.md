---
assert: true
---

# Noolang Language Reference

> Complete reference for Noolang syntax, operators, and language constructs.

## Source Code References

- **Lexer**: [`src/lexer/lexer.ts`](../src/lexer/lexer.ts) - Token definitions and parsing
- **Parser**: [`src/parser/`](../src/parser/) - Syntax parsing and AST construction
- **AST**: [`src/ast.ts`](../src/ast.ts) - Abstract syntax tree node definitions
- **Tests**: [`src/lexer/__tests__/`](../src/lexer/__tests__/) - Comprehensive language feature tests

## Literals

### Numbers

Noolang has one numeric type — no separate Int/Float:

```noolang
42;          # => 42 : Float
3.14159;     # => 3.14159 : Float
123.456;     # => 123.456 : Float
```

### Strings

```noolang
"Hello, World!";      # => "Hello, World!" : String
"String with spaces"; # => "String with spaces" : String
"";                   # => "" : String
```

### Template Strings

Backtick-delimited strings interpolate expressions with `${...}`. Each hole
desugars to `show <expr>` concatenated into the string, so a hole accepts any
expression whose type implements `Show` (`Show String` is identity, so string
holes interpolate as-is). A hole whose type has no `Show` implementation is a
type error, and effects performed inside a hole propagate as usual.

Ordinary `"..."` strings are completely inert — only backticks opt in to
interpolation. Templates may span multiple lines and contain unescaped `"`.
Escape a literal backtick as `` \` `` and a literal `${` as `\$`; the usual
`\n`, `\t`, `\r` escapes also work.

```noolang
name = "World";
`Hello, ${name}!`;         # => "Hello, World!" : String
# a Float hole goes through show
`1 + 2 = ${1 + 2}`;        # => "1 + 2 = 3" : String
# escaped hole
`price: \${5}`;            # => "price: ${5}" : String
# unescaped double quotes are fine
`say "hi"`;                # => "say \"hi\"" : String
```

### Booleans

```noolang
True;   # => True : Bool
False;  # => False : Bool
```

### Lists

```noolang
[];              # => [] : List a
[1, 2, 3];       # => [1, 2, 3] : List Float
["a", "b"];      # => ["a", "b"] : List String

# Safe element access (index, list) -> Option
at 0 [10, 20, 30];   # => Some 10 : Option Float
at 3 [10, 20, 30];   # => None : Option Float
```

### Records

```noolang
{};                              # => {} : {}
{ @name "Alice", @age 30 };      # => {@name "Alice", @age 30} : { @name String, @age Float }
{ @x 1, @y 2, @z 3 };           # => {@x 1, @y 2, @z 3} : { @x Float, @y Float, @z Float }
```

## Keywords

All keywords supported by the lexer ([`src/lexer/lexer.ts:147-176`](../src/lexer/lexer.ts#L147-L176)):

### Control Flow

- `if` `then` `else` - Conditional expressions
- `match` - Pattern matching

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

## Literate Programming

`.md` files run as literate Noolang: every ```` ```noolang ```` fenced block
in the file is concatenated (file order, `;`-separated) into one program and
executed — see `preprocessLiterateNoolang` in `src/parser/parser.ts`.

An optional frontmatter block may open the file, before anything else:

```
---
shadow: true
assert: true
---
```

Hand-rolled `key: value` parsing, not YAML — only `shadow` and `assert` are
recognized; unknown keys are ignored. Both are independent booleans, default
`false` when omitted.

- **`shadow: true`** — disables the "type already defined elsewhere in this
  file" check for the whole file, for docs that legitimately redeclare the
  same illustrative type name across independent sections (built-in/reserved
  type names stay unshadowable regardless).
- **`assert: true`** — makes trailing `# => <expected>` line comments
  load-bearing: each statement's actual runtime value is always checked
  against `<expected>`; its type is checked too, but only if `<expected>`
  includes a `: Type` suffix. A value-only annotation matches on value alone
  — it is never wrong to omit the type, only optional to include it. Both
  forms are valid:
  ```noolang
  1 + 2;  # => 3
  1 + 2;  # => 3 : Float
  ```
  Limitations: `# =>` must be on the same source line the checked statement
  *starts* on — a multi-line statement can only be annotated if its first
  line already ends the expression (otherwise there's nowhere valid to put
  the comment, and it's silently never checked). A parenthesized nested
  sequence (`where (x = 1; y = 2)`) is checked as one opaque unit at the
  `where` expression's own line — its internal `x = 1`/`y = 2` pieces are
  not independently checkable.

README.md carries both flags in its own frontmatter, since it redeclares
illustrative types (`variant Color = ...`) across sections and its `# =>`
comments are checked against real output rather than being trusted prose.

## Built-in Functions

Noolang provides a comprehensive set of built-in functions for common operations, I/O, and system interaction.

### System Operations

#### Process Execution

The `exec` function enables type-safe shell command execution, returning a `Result` type for proper error handling.

```noolang
# Type signature (curried): String -> List String -> Result String ExecError
# `exec` takes a command and a list of argument strings.
exec
```

**Basic Usage:**

```noolang
# Execute a simple command
result = exec "echo" ["hello world"];
match result (
    Ok output => println output;    # Prints: hello world
    Err error => println (show error)   # CommandFailed {@code, @stdout, @stderr} | ExecFailed msg
)
```

**Working with Command Arguments:**

```noolang
# Execute commands with multiple arguments
lsResult = exec "ls" ["-la", "/tmp"];
match lsResult (
    Ok output => println ("Directory listing:\n" + output);
    Err error => println ("Failed to list directory: " + show error)
)
```

**Practical Automation Examples:**

```noolang
# Get current user and date
getUserInfo = fn _ =>
    match exec "whoami" [] (
        Ok user => match exec "date" [] (
            Ok date => Ok (user + " at " + date);
            Err error => Err ("Date failed: " + show error)
        );
        Err error => Err ("User lookup failed: " + show error)
    );

# Use the automation function
userInfo = getUserInfo {};
match userInfo (
    Ok info => println ("Current session: " + info);
    Err error => println ("System info error: " + show error)
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
```

The following are rejected at type-check time (shown as plain text so the
documentation validator doesn't execute intentionally-invalid code):

```
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

File I/O performs real filesystem effects, so these examples are shown as plain
text (the documentation validator does not execute them):

File operations return `Result` — a missing file or a failed write is a value
to handle, not a crash. `readFile : String -> Result String ReadError !read`;
`writeFile : String -> String -> Result {} WriteError !write`.

```
# Read file contents
match (readFile "example.txt") (
  Ok content => println content;
  Err e => println (show e)      # e.g. FileNotFound(example.txt)
);

# Write to file
match (writeFile "output.txt" "Hello from Noolang!") (
  Ok _ => println "written";
  Err e => println (show e)
)
```

#### Logging

```noolang
# Write to log
log "Application started";
userCount = 42;
log ("User count: " + toString userCount);
```

### Utility Functions

#### Type Conversion

```noolang
# Convert any value to string representation
toString 42;        # => "42" : String
toString True;      # => "True" : String
toString [1, 2, 3]; # => "[1; 2; 3]" : String

# Type erasure (convert to Unknown type)
forget 42;          # => 42 : Unknown
```

#### String Operations

```noolang
# String concatenation
concat "Hello" " World";   # => "Hello World" : String
```

#### Mathematical Functions

```noolang
# Absolute value
abs (-5);    # => 5 : Float

# Min/Max
min 3 7;     # => 3 : Float
max 3 7;     # => 7 : Float
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
result1 = addTwo 5 3;  # => 8 : Float

# Partial application
add5 = addTwo 5;
result2 = add5 10;     # => 15 : Float

# Multiple arguments
createPerson = fn name age job => { @name name, @age age, @job job };
person = createPerson "Alice" 30 "Engineer";  # => {@name "Alice", @age 30, @job "Engineer"} : { @name String, @age Float, @job String }
```

### Pipeline Operators in Detail

#### Pipe Operator (`|`)

```noolang
# Applies value to function (thrush)
addThree = fn x => x + 3;
multiplyTwo = fn x => x * 2;
# multiplyTwo (addThree 5)
5 | addThree | multiplyTwo;    # => 16 : Float

# Data transformation with function application
doubled = map (fn x => x * 2) [1, 2, 3];
result = head doubled;               # => Some 2 : Option Float

# Field access with pipe
user = { @name "Alice", @age 30 };
userName = user | @name;             # => "Alice" : String
```

#### Function Composition (`|>`)

```noolang
# Composes functions left-to-right
addOne = fn x => x + 1;
square = fn x => x * x;
composed = addOne |> square;    # fn x => square (addOne x)

# Use composed function
# square (addOne 5)
result = 5 | composed;             # => 36 : Float
```

#### Safe Pipe (`|?`)

```noolang
# Works with Option/Result types
divideByTwo = fn x => x / 2;
multiplyByThree = fn x => x * 3;
Some 12 |? divideByTwo |? multiplyByThree;  # => Some 18 : Option Float
```



### Conditional Expressions

```noolang
# Basic conditional
x = 5;
result = if x > 0 then "positive" else "non-positive";  # => "positive" : String

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
result = (x = 5; y = 10; x + y * 2);  # => 25 : Float

# More complex example
x = 6;
z = 9;
calculation = (base = x * 2; helper = 3; base + helper);  # => 15 : Float
```

Inside a parenthesized sequence, a non-final item may also be a **bare
expression**, but only if its type is `{}` (unit) — dropping unit discards
nothing, while silently dropping data is almost always a lost result. Effects
of bare items propagate exactly as bindings' do:

```noolang
# println returns {}, so no throwaway binding is needed
greet = fn name => (println ("hello " + name); name);
```

To discard a non-unit value deliberately, bind it to the wildcard `_`, which
evaluates the right-hand side and binds nothing:

```noolang
# writeFile returns Result {} WriteError; `_ =` discards it explicitly
touch = fn path => (_ = writeFile path ""; path);
```

The following would be a type error (a non-unit value is silently dropped —
this also catches dead code like a mistyped accumulation line):

```
# TypeError: Cannot unify types in discarding a non-final sequence item
f = fn x => (x + 1; x)
```

The top level of a program is exempt: unparenthesized top-level sequences may
display values of any type, as this reference itself does throughout.

### Record Operations

```noolang
# Record creation
person = { @name "Alice", @age 30, @city "NYC" };  # => {@name "Alice", @age 30, @city "NYC"} : { @name String, @age Float, @city String }

# Record with computed fields
{ @x 1 + 2, @y 3 * 4 };  # => {@x 3, @y 12} : { @x Float, @y Float }
```

### Accessor Patterns

```noolang
# Simple record operations
{ @name "Alice", @age 30 };  # => {@name "Alice", @age 30} : { @name String, @age Float }
```

### Pattern Matching and Exhaustiveness

`match expr (Pattern => branch; ...)` dispatches on a value. When the
scrutinee has a concrete variant type (including built-ins like `Option`,
`Result`, and `Bool`), every constructor must be covered or a catch-all must
be present — otherwise the match is a **type error**.

```noolang
# Exhaustive match — all Option constructors covered
unwrapOr = fn opt default => match opt (
    Some x => x;
    None => default
);
unwrapOr (Some 42.0) 0.0  # => 42 : Float
```

```noolang
# Wildcard catch-all satisfies exhaustiveness
describe = fn opt => match opt (
    Some x => "got " + show x;
    _ => "nothing"
);
describe None  # => "nothing" : String
```

The following would be a type error (missing `None` case):

```
# TypeError: Non-exhaustive match on Option: missing case None.
match (Some 1) (Some x => x)
```

A bare variable catch-all also works: `other => ...` matches anything not
already covered and binds the value.

### Destructuring Bindings

Record destructuring binds a **subset** of fields — extra fields in the record
are simply ignored. Only naming a field the record does not have is an error.

```noolang
# Bind just @a — @b is ignored
rec = {@a 10.0, @b 20.0};
{@a} = rec;
a  # => 10 : Float
```

```noolang
# Rename on destructure
{@name n, @age} = {@name "Alice", @age 30.0};
n + " is " + show age  # => "Alice is 30" : String
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

Noolang has a module system where each `.noo` file is a module. A module's
**last expression** is its exported value — typically a record of named
bindings.

```
# math.noo — the last expression is the exported record
addFn = fn x y => x + y;
multiplyFn = fn x y => x * y;
{@add addFn, @multiply multiplyFn}
```

### Importing modules

Use `import "specifier"` to import another module.

```
# Import the whole module as a record
math = import "./math";
result = (@add math) 2 3;   # 5

# Selective import via subset destructuring (recommended)
{@add} = import "./math";
result = add 2 3;           # 5

# Rename while importing
{@add myAdd} = import "./math";
result = myAdd 2 3;         # 5
```

### Specifier rules

| Form | Resolves to |
|------|-------------|
| `"./path"` or `"../path"` | File relative to the importing module |
| `"bare-name"` or `"prefix/name"` | Entry in `noolang.json` import map |
| `"std/*"` | Modular standard library, shipped with the interpreter — see [Standard library modules](#standard-library-modules-std) below |

Relative specifiers **must** begin with `./` or `../`. A bare specifier that
has no matching import-map entry is a compile-time error.

### Import map (`noolang.json`)

Place a `noolang.json` at your project root to give short names to paths:

```
{
  "imports": {
    "math": "./lib/math",
    "utils/": "./src/utils/"
  }
}
```

Then `import "math"` resolves to `./lib/math.noo` relative to the map file.

### Rules and restrictions

**Imports are pure.** A module may not perform top-level effects (`print`,
`writeFile`, etc.). Doing so is a type error at import time. To share
effectful operations, export an effect-typed function instead.

**Circular imports error.** Because a module *is* its evaluated value,
`A → B → A` is unresolvable. The error message includes the full cycle chain.

**Coherence.** Only one `implement` block per `(Trait, Type)` pair is allowed
across a program. Conflicting instances from different modules are an error.

### Auto-loaded standard library

All standard library functions (`map`, `filter`, `equals`, `show`, etc.) are
loaded automatically at startup — you do not need to import them.

### Standard library modules

Separately, `import "std/<name>"` resolves to a `.noo` module shipped with
the interpreter (see the specifier table above) — these are opt-in, plain
userland noolang with no special interpreter privileges, unlike the
auto-loaded functions above.

- **`std/json`** — JSON parse/serialize over a concrete `JsonValue` variant.

  ```noolang
  {@json_parse json_parse, @json_stringify json_stringify, @json_field json_field}
    = import "std/json";

  parsed = json_parse "{\"name\":\"Ada\",\"tags\":[\"math\",\"cs\"]}";
  name = match parsed (
    Ok doc => match (json_field "name" doc) (
      Ok v => json_stringify v;
      Err _ => "missing field"
    );
    Err _ => "parse error"
  );
  name  # => "\"Ada\"" : String
  ```

  `json_parse : String -> Result JsonValue JsonParseError` and
  `json_stringify : JsonValue -> String` round-trip objects, arrays,
  strings (with `\" \\ \/ \n \r \t` escapes), and numbers (negative,
  decimal, exponent). `json_field`/`json_index` extract members by key/index;
  `json_as_string`/`json_as_number`/`json_as_bool`/`json_as_array`/
  `json_as_object` narrow a `JsonValue` to a concrete shape — all
  `Result`-based and composable. Scope limits worth knowing: `\u`, `\b`,
  `\f` string escapes are rejected rather than decoded (no codepoint↔char
  builtin exists to decode `\uXXXX` with), and non-finite numbers
  (`Infinity`/`NaN`, reachable via overflow) serialize to `"null"`. Full
  design notes: [`docs/internal/specs/std-json.md`](internal/specs/std-json.md).

- **`std/parser`** — the generic parser-combinator library `std/json` is
  built on (`choice`, `many`, `sep_by`, `between`, `pmap`, `pbind`, and
  friends), if you're writing your own text-format parser. See
  [`docs/internal/specs/std-parser.md`](internal/specs/std-parser.md).

- **`std/test`** — the `noo test` testing framework. See
  [Testing: `noo test`](tools-and-cli.md#testing-noo-test) in the Tools & CLI
  guide.

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
result1 = 10 / 2;  # => Some 5 : Option Float
result2 = 10 / 0;  # => None : Option Float

# Option types for nullable values (built-in)
option1 = head [1, 2, 3];  # => Some 1 : Option Float
option2 = head [];         # => None

# Show the results
show result1;  # => "Some(5)" : String
```

## Next Steps

- **Type System**: Read [Type System Guide](type-system-guide.md) for details on inference and constraints
- **Standard Library**: See [`stdlib.noo`](../stdlib.noo) for built-in functions and traits
- **Examples**: Check [Examples & Tutorials](examples-and-tutorials.md) for practical usage patterns
