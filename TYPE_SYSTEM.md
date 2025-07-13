Absolutely. Here's a concise, targeted write-up you can pass to Cursor to ground it in your type system and effect model for **Noolang**:

---

## 🧠 Noolang Type System and Effect Model (for Cursor)

Noolang is a principled, expression-based language designed for LLM-assisted and human-readable programming. The type system is lightweight but expressive, favoring inference and explicit effects over full dependent types.

---

### 🔤 Type System Overview

#### **Type Syntax**

* **Unified type annotations**: `expr : type` syntax works everywhere
* **Definition context**: `name = expr : type` (no parentheses needed)
* **Expression context**: `(expr : type)` (parentheses for precedence/clarity)
* Function types: `(Arg1 Arg2) -> Return` (right-associative)
* Type annotations are optional but encouraged; required for all effectful expressions
* Type aliases and nominal types are allowed (planned)

#### **Type Annotation Scoping Rules**

* **Sequences**: Type annotations apply to the expression immediately preceding them
  ```noolang
  a = 1; b = 2; c = 3 : Number  # Only c = 3 is Number
  ```
* **Parentheses**: Group expressions to apply type to the whole group
  ```noolang
  a = (1; 2; 3) : Number  # Only the final expression '3' is Number
  ```
* **Nested annotations**: Can annotate subexpressions within sequences
  ```noolang
  (
    1 : Number;
    false : Boolean;
    "foo" : String
  ) : String  # Each subexpression checked, final type is String
  ```

#### **Primitive Types**

* `Number`, `Bool`, `String`
* Type constructors: `List T`, `Tuple T1 T2`, `Record { name: String age: Number }` (planned)
* `unit` represents the unit type (empty value)

#### **Data Structure Type Annotations**

* **Tuples**: Require type for each slot
  ```noolang
  pair = {1, 2} : {Number, Number}  # ✅ Correct
  triple = {1, 2, 3} : Number       # ❌ Error - tuples need types for each slot
  ```
* **Records**: Require type for each field
  ```noolang
  person = {@name "Alice", @age 30} : {@name String, @age Number}
  ```
* **Lists**: Type applies to element type
  ```noolang
  numbers = [1, 2, 3] : [Number]
  ```

#### **Polymorphism**

* Lowercase type names (`a`, `b`) are considered generic type variables
* **Current limitation**: Type variables are not unified to concrete types yet

  ```noolang
  identity = fn x => x : a -> a  # Type variable 'a' not resolved yet
  ```

---

### 🚧 Planned: Type Constraints and Constrained Polymorphism

Noolang will support **type constraints** for more expressive and safe generic programming.

- **Syntax**: `: a -> a given a is Collection`
- **Semantics**: Functions can declare that their type variables must satisfy certain constraints (e.g., must be a `Collection`, `Number`, etc.).
- **Use Cases**:
  - Restricting generic functions to only work on certain kinds of types.
  - Enabling ad-hoc polymorphism (type classes/traits/interfaces).
  - Improving error messages and safety for partial functions (like `head`).
  - Allowing user-defined constraints for extensibility.
- **Implementation**:
  - The type checker will track constraints on type variables.
  - Constraint solving will be part of type inference.
  - Constraints can be user-defined and extensible.

#### Example

```noolang
# Only works for types that are Collection
first = fn xs => ... : a -> b given a is Collection
```

#### Architectural Notes
- Constraints will be attached to type variables and propagated during type inference.
- The constraint system will enable safe, expressive, and extensible generic programming.
- This feature is inspired by type classes (Haskell), traits (Rust), and interfaces (TypeScript/Java).
- Partial functions (like `head`) should use `Option` types or constraints to ensure safety.

---

#### **Optional + Result Types**

* `Option a` represents optional values (planned)
* `Result a e` represents success (`Ok a`) or failure (`Err e`) (planned)
* `unit` is used to represent absence or unit values

---

### ⚡ Effect System

Noolang makes **side effects explicit** in types. All functions that perform I/O, mutation, or other impure operations must declare those effects.

#### **Effect Type Syntax (Planned)**

* Effects follow the return type using postfix annotation: `: Type !effect1 !effect2`
* **Current limitation**: Effect annotations cause parser errors and are temporarily disabled

  ```noolang
  # Planned syntax (currently commented out):
  #readFile = path => ... : String !io
  ```

#### **Current Effect Implementation**

* Effects are currently modeled by attaching effects to function types
* Uses thunking workaround for effectful computations
* **Key insight identified**: Expressions should have (Type, Effects) pairs, not types with embedded effects

#### **Rules**

* Pure expressions need no effect annotations
* Effects are compositional and must propagate up through the call chain
* The type checker must enforce that callers of effectful functions also declare those effects
* A file is considered effectful if its top-level expression is effectful

#### **Planned Core Effects**

* `!io` – input/output
* `!log` – logging or console output
* `!mut` – local mutation
* `!rand` – nondeterminism
* `!err` – error throwing (if introduced; currently `Result` is preferred)

#### **Examples**

```noolang
# Current working syntax:
add = fn x y => x + y : Number -> Number -> Number

# Planned effect syntax (currently disabled):
#logLine = fn msg => log msg : unit !log
#getUserName = fn () => readFile "/user.txt" : String !io

compute = fn n => n * n : Number
```

---

### 🔧 Type Inference Strategy (Current Implementation)

* Local inference only; no global type solving required
* Variables without annotations are inferred if:
  * Used consistently
  * Do not require generalization
* **Current limitation**: Type variables are not unified to concrete types
* Effects must always be declared manually and are not inferred (by design)
* REPL and dev tools can show inferred types inline for LLM and human inspection

---

### 🧪 Current Implementation Status

* **Parser**: ✅ Fully supports type annotations with `name = expr : type` syntax
* **Type Variables**: ❌ Not unified yet (e.g., `t1 -> Number` not resolved to `Number -> Number`)
* **Effect Annotations**: ❌ Parser errors - temporarily disabled
* **Record Type Annotations**: ❌ Parser doesn't support `{ name: String, age: Number }` yet
* **Type Constructors**: ❌ `List T`, `Tuple T1 T2` not implemented yet
* **Expression-level type annotations**: ❌ `(expr : type)` syntax not implemented yet

### 🎯 Next Implementation Priorities

1. **Type Variable Unification**: Resolve `t1 -> Number` to `Number -> Number`
2. **Effect System Refactoring**: Separate types from effects (expressions have (Type, Effects) pairs)
3. **Expression-level type annotations**: Support `(expr : type)` syntax for complex expressions
4. **Record Type Annotations**: Support `{ name: String, age: Number }` syntax
5. **Type Constructors**: Implement `List T`, `Tuple T1 T2` syntax

---

### 🎯 Planned: Destructuring Patterns

Noolang will support **destructuring patterns** for tuples and records to enable more ergonomic data extraction and import spreading.

#### **Design Philosophy**

* **Safety First**: Only support destructuring for data structures with fixed, statically-known structure
* **Explicit Patterns**: Clear, predictable syntax that's LLM-friendly
* **No List Destructuring**: Lists have variable length, making destructuring unsafe
* **Immutable Variables**: Destructuring creates new immutable bindings

#### **Tuple Destructuring**

Extract values from tuples by position:

```noolang
# Basic tuple destructuring
{one, two} = {1, true}  # one = 1, two = true

# With type annotations
{first: Number, second: String} = {42, "hello"}  # first = 42, second = "hello"

# Nested destructuring (future)
{outer: {inner, rest}} = {outer: {1, 2}, rest: 3}
```

**Grammar**: `{identifier, identifier, ...} = tuple_expression`

#### **Record Destructuring**

Extract fields from records with flexible naming:

```noolang
# Record destructuring with renaming
{@key localName} = {@key true}  # localName = true

# Record shorthand (field name = variable name)
{@key, @key2} = {@key true, @key2 2}  # key = true, key2 = 2

# Mixed renaming and shorthand
{@name userName, @age} = {@name "Alice", @age 30}  # userName = "Alice", age = 30
```

**Grammar**: 
* `{@identifier identifier} = record_expression` (rename)
* `{@identifier} = record_expression` (shorthand)

#### **Import Spreading**

Use destructuring to extract functions from imported modules:

```noolang
# Import and destructure math functions
{add, multiply} = import "std/math"
result = add 2 3

# Import with renaming
{@add addFn, @multiply mulFn} = import "std/math"
result = addFn 2 3

# Import with shorthand
{@add, @multiply} = import "std/math"
result = add 2 3
```

#### **Safety Guarantees**

* **No Name Collisions**: Attempting to destructure into an existing variable name is an error
* **Complete Patterns**: All fields in a record must be accounted for (no partial destructuring)
* **Type Safety**: Each destructured field gets proper type inference
* **Static Analysis**: All destructuring patterns are validated at parse time

#### **Implementation Requirements**

1. **Parser**: Add destructuring patterns to definition expressions
2. **AST**: `TupleDestructuringExpression`, `RecordDestructuringExpression` node types
3. **Evaluator**: Extract and bind multiple values from destructured data
4. **Type System**: Handle type inference for each destructured field
5. **Error Handling**: Clear error messages for incomplete or invalid patterns

#### **Why No List Destructuring**

List destructuring is intentionally excluded because:

* **Variable Length**: Lists can have any length, making patterns unpredictable
* **Runtime Errors**: Would require complex error handling for length mismatches
* **Type Safety**: Hard to statically guarantee pattern safety
* **Alternative**: Use `head`/`tail` functions or future pattern matching

#### **Future Extensions**

* **Nested Destructuring**: Support destructuring within destructuring patterns
* **Default Values**: Allow default values for optional record fields
* **Pattern Matching**: Integrate with future `match`/`case` expressions
* **Type Annotations**: Support type annotations within destructuring patterns

---

*This document reflects the current state as of the latest implementation session.*
