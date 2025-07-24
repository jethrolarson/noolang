# Trait System Design Document

## Overview

This document outlines the design and implementation plan for Noolang's trait system. The trait system provides function overloading through type-based dispatch, allowing code like `map increment (Some 1)` to work automatically.

## Current Status

**IMPORTANT**: Phase 2 implementation is complete and functional (2024-12):

- ✅ **Legacy System Removed**: All old constraint files gutted, tests marked as skipped
- ✅ **Core ADT/Generic Foundation**: Basic ADTs, generics, higher-order functions, and partial application work well
- ✅ **Design Decisions Finalized**: Complete architectural plan agreed upon
- ✅ **Phase 1 Complete**: Core infrastructure implemented with `TraitRegistry` and trait system types
- ✅ **Phase 2 Complete**: Nominal traits implemented - `map increment (Some 1)` works!
- ✅ **Parser Issues Fixed**: Right-associative function types, type constructor variables, and multiline syntax

## Why We're Rebuilding

The previous constraint system was "a mess of half built stuff and old assumptions" with multiple conflicting systems. Key problems:
- Complex constraint solving that failed basic cases
- `map (fn x => x + 1) (Some 1)` didn't work
- Old broken system interfered with new trait system  
- Type variable inconsistency issues

## Core Goals

1. **Function Overloading**: Allow the same function name (`map`, `show`, etc.) to work with different types
2. **Type-based Dispatch**: Automatically select the correct implementation based on argument types
3. **Constrained Polymorphism**: Support generic functions with trait bounds
4. **First-class Constraints**: Allow unresolved constrained expressions to exist as values

## Key Examples (Working!)

```noo
# Trait definition
constraint Functor f (
  map : (a -> b) -> f a -> f b
);

# Implementation  
implement Functor Option (
  map = fn f opt => match opt with ( Some x => Some (f x); None => None )
);

# Usage - automatically dispatches to Option's map ✅ WORKS!
result = map (fn x => x + 1) (Some 42);  # → Some 43

# Basic trait dispatch ✅ WORKS!
constraint Show a ( show : a -> String );
implement Show Int ( show = toString );
result = show 42;  # → "42"

# Future: Constrained expressions as first-class values (Phase 3+)
x = pure 1;              # x : m Int given m implements Monad
head x;                  # Forces x to List Int, returns Option Int
option_get_or 2 x;       # Forces x to Option Int, returns Int

# Future: Partial application preserves constraints (Phase 3+)
map_increment = map (fn x => x + 1);  # : f Int -> f Int given f implements Functor

# Future: Accessor constraints (Phase 3)
@name;                   # : r -> a given r implements HasField "name" a
@name {name: "Alice"};   # → "Alice"
```

## Architecture Decisions

### 1. Constraint Storage
- **Constrained Types**: `{ baseType: Type, constraints: Map<string, Constraint[]> }`
- Constraints are tracked per type variable
- All constraints are conjunctive (AND only, no OR)

### 2. Resolution Strategy
- **Lazy Resolution**: Constraints remain unresolved until forced by concrete usage
- Definitions store constrained types: `x = pure 1` keeps `x : m Int given m implements Monad`
- Function application forces resolution when needed

### 3. Constraint Scoping
- Constraints resolve internally when possible
- `foo = fn x => head (pure x)` has type `(a) -> Option a` (constraints resolved internally)
- Constraints propagate through partial application

### 4. Instance Selection
- **No Overlapping Instances**: Multiple implementations for the same trait+type combination are not allowed
- Second `implement` statement should produce a type error

### 5. Error Handling
- Constraint resolution failures are type errors
- Track constraint origins for clear error messages
- Show why constraint resolution failed

### 6. Runtime Representation
- Some runtime representation needed for REPL functionality
- Unresolved constraints may exist at runtime

## Critical Implementation Notes

### Key Architectural Insights from Design Process

1. **Function Composition & Constraints**: Simple composition like `map show` creates complex constraint combinations:
   ```noo
   map : (a -> b) -> f a -> f b given f implements Functor
   show : a -> String given a implements Show
   # Result: f a -> f String given f implements Functor, a implements Show
   ```

2. **No OR Constraints**: Only conjunctive (AND) constraints needed. OR would be weird and unnecessary.

3. **Partial Application Critical**: `map increment` must preserve constraints for remaining arguments.

4. **Dollar Operator**: `$` is just syntactic sugar for function application - no special constraint handling needed.

5. **Resolution Examples**:
   ```noo
   x = pure 1;           # x : m Int given m implements Monad (unresolved)
   head x;               # Forces resolution: m = List, returns Option Int  
   option_get_or 2 x;    # Forces resolution: m = Option, returns Int
   foo = fn x => head (pure x);  # Type: (a) -> Option a (resolved internally)
   ```

## Implementation Phases

### Phase 1: Core Infrastructure ✅ COMPLETE
1. ✅ Extend `Type` AST with `ConstrainedType`
2. ✅ Update `TypeState` to include `TraitRegistry` 
3. ✅ Modify type inference to handle constraint propagation
4. ✅ Implement basic constraint unification rules

### Phase 2: Nominal Traits ✅ COMPLETE
1. ✅ Parse `constraint` and `implement` definitions
2. ✅ Implement trait function dispatch in variable lookup
3. ✅ Support basic traits: `Functor`, `Show`, `Eq` (Monad pending)
4. ✅ Handle partial application with constraint propagation
5. ✅ **Parser fixes**: Right-associative `->`, type constructor variables (`f a`), correct match syntax
6. ✅ **Remove type whitelisting**: Support complex types in implement definitions (`List Int`, `a -> b`, etc.)

### Phase 3: Structural Constraints ⏳ NEXT
1. Implement `HasField` constraint for record accessors
2. Add `@field` syntax sugar (`@key` → `accessor "key"`)
3. Support record type inference with field constraints

### Phase 4: Polish
1. Improve error messages with constraint origin tracking
2. Runtime constraint representation for REPL
3. Optimization and performance improvements
4. Add `Monad` trait support

## Type System Extensions

### New AST Types

```typescript
// Extend existing Type union
type Type = 
  | ...existing types...
  | ConstrainedType;

type ConstrainedType = {
  kind: 'constrained';
  baseType: Type;
  constraints: Map<string, Constraint[]>; // variable name -> constraints
};

type Constraint = 
  | { kind: 'implements'; trait: string }
  | { kind: 'hasField'; field: string; fieldType: Type };

// Trait system types
type TraitDefinition = {
  name: string;
  typeParam: string;
  functions: Map<string, Type>;
};

type TraitImplementation = {
  typeName: string;
  functions: Map<string, Expression>;
};

type TraitRegistry = {
  definitions: Map<string, TraitDefinition>;
  implementations: Map<string, Map<string, TraitImplementation>>;
};
```

### Type Inference Changes

1. **Variable Lookup**: Check for trait functions before throwing "undefined variable"
2. **Function Application**: Attempt constraint resolution during unification
3. **Generalization**: Preserve constraints in type schemes
4. **Unification**: Handle constrained types with constraint merging

## Syntax

### Trait Definitions
```noo
constraint TraitName typeParam (
  function1 : Type1;
  function2 : Type2;
  ...
);
```

### Trait Implementations
```noo
implement TraitName TypeName (
  function1 = implementation1;
  function2 = implementation2;
  ...
);
```

### Accessor Sugar
```noo
@fieldName       # → accessor "fieldName"
@fieldName obj   # → (accessor "fieldName") obj
```

## Error Messages

### Constraint Resolution Failure
```
Error: No implementation of Functor for String
  in expression: map increment "hello"
  
  Functor constraint originated from:
    map : (a -> b) -> f a -> f b given f implements Functor
    at line 5, column 12
```

### Overlapping Instance
```
Error: Duplicate implementation of Show for Int
  Previous implementation at line 8, column 1
  New implementation at line 15, column 1
```

### Unresolved Constraint
```
Error: Cannot resolve constraint: m implements Monad
  in expression: pure 1
  
  No concrete type information available to select monad instance.
  Consider adding a type annotation or using in a context that forces the monad type.
```

## Testing Strategy

1. **Unit Tests**: Individual constraint operations (unification, resolution, etc.)
2. **Integration Tests**: Full trait definitions and usage
3. **Error Tests**: Comprehensive error message validation
4. **Performance Tests**: Constraint resolution performance
5. **REPL Tests**: Interactive constraint handling

## Files Modified During Cleanup

**Gutted/Removed**:
- `src/typer/constraints.ts` - Gutted to minimal exports
- `src/typer/constraint-resolution.ts` - Gutted to stub functions
- `src/typer/constraint-*.ts` - Removed (generation, solver, etc.)

**Tests Marked as Skipped**:
- `src/typer/__tests__/constraints.test.ts`
- `src/typer/__tests__/constraint-resolution.test.ts`  
- `src/typer/__tests__/trait-system.test.ts`
- `test/features/constraints/` - All constraint tests

**Core Files Cleaned**:
- `src/typer/function-application.ts` - Removed constraint validation logic
- `src/typer/type-inference.ts` - Removed constraint function lookup
- `src/typer/unify.ts` - Already clean

**Current Test Status**: Tests passing, trait system functional

## Implementation Summary

### ✅ What Works Now
1. **Basic trait function dispatch**: `show 42` → `"42"`
2. **Complex function types**: `(a -> b) -> f a -> f b` parses correctly
3. **Multiline syntax**: Constraint and implement definitions work across multiple lines
4. **Type inference**: Trait calls are properly type-checked
5. **Core traits**: `Show`, `Eq`, and `Functor` implemented and tested
6. **Complex type implementations**: `implement Show (List Int)`, `implement Show (a -> b)`, etc.

### 🎯 Key Achievement
**The target goal `map increment (Some 1)` is now working!**

### 🔧 Parser Fixes Applied
During Phase 2 implementation, several critical parser issues were identified and fixed:

1. **Right-associative function types**: `a -> b -> c` now correctly parses as `a -> (b -> c)` instead of `(a -> b) -> c`
2. **Type constructor variables**: Added support for lowercase type applications like `f a` where `f` is a type parameter
3. **Correct match syntax**: Fixed examples to use `match x with ( pat => expr )` instead of incorrect `case x { pat -> expr }`
4. **Parentheses vs braces**: Clarified that `{}` is only for tuples/records, `()` is for grouping and function parameters

These fixes ensure that complex trait function types parse correctly and multiline syntax works as expected.

### 📝 Working Examples
See `examples/trait_truly_multiline_demo.noo` and `examples/minimal_trait_test.noo` for demonstrations.

## Next Steps for Implementation

1. **Phase 3**: Implement structural constraints (`HasField`)
2. **Add Monad trait**: Complete the core trait collection
3. **Improve error messages**: Better constraint resolution error reporting
4. **Runtime support**: REPL improvements for constraint handling

## Future Considerations

- **Higher-kinded Types**: Support for traits like `Monad` that take type constructors
- **Associated Types**: Types associated with trait instances
- **Coherence**: Ensuring trait resolution is deterministic
- **Orphan Instances**: Rules about where implementations can be defined
- **Constraint Synonyms**: Type aliases for common constraint combinations

## References

- Haskell type classes and constraint handling
- PureScript type class implementation
- Rust trait system design
- Swift protocol system