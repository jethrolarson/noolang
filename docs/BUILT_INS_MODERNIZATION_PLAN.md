# Built-ins Modernization Plan

## Overview

Most of Noolang's built-in functions were implemented before ADTs, traits/constraints, and the effect system were added. This document outlines a plan to modernize them to take advantage of these newer language features.

## Current State Analysis

### Built-ins That Need Modernization

#### 1. **Print Functions - Missing Show Constraint**
```noolang
# Current (overly permissive)
print : a -> a !write
println : a -> a !write

# Modernized (type-safe)
print : a -> a !write given Show a
println : a -> a !write given Show a
```

#### 2. **Comparison Operators - Could Use Eq Trait**
```noolang
# Current (built-in polymorphism)
== : a -> a -> Bool
!= : a -> a -> Bool

# Modernized (trait-based)
constraint Eq a ( equals : a -> a -> Bool; notEquals : a -> a -> Bool );
implement Eq Int ( equals = primitive_int_eq; notEquals = fn a b => not (equals a b) );
implement Eq String ( equals = primitive_string_eq; notEquals = fn a b => not (equals a b) );
```

#### 3. **String Conversion - Could Use Show Trait**
```noolang
# Current (overly permissive)
toString : a -> String

# Modernized (trait-based)
toString : a -> String given Show a
toString = show  # Just an alias for show
```

#### 4. **List Operations - Could Return Options**
```noolang
# Current (unsafe - can throw)
list_get : Int -> List a -> a

# Modernized (safe with Option)
list_get : Int -> List a -> Option a
```

#### 5. **Self-Hostable Functions**
These could be moved from TypeScript to Noolang:
- Boolean operations (`not`, `bool_and`, `bool_or`) - ✅ Already in stdlib.noo
- Option utilities (`option_get_or`, `option_map`) - ✅ Already in stdlib.noo
- Result utilities (`result_get_or`, `result_map`) - ✅ Already in stdlib.noo

### Built-ins That Are Well-Designed
- Pipeline operators (`|`, `|>`, `<|`, `$`)
- Arithmetic operators (`+`, `-`, `*`, `/`)
- List operations (`map`, `filter`, `reduce`, `append`)
- Effect-based I/O (`readFile`, `writeFile`, `log`)

## Modernization Plan

### Phase 1: Add Core Traits to Standard Library

```noolang
# Add to stdlib.noo

# ========================================
# CORE TRAITS FOR BUILT-INS
# ========================================

# Show trait for string conversion
constraint Show a ( show : a -> String );

# Basic implementations
implement Show Int ( show = intToString );  # Assumes primitive intToString
implement Show String ( show = fn s => s );
implement Show Bool ( show = fn b => match b with (True => "True"; False => "False") );

# Eq trait for equality
constraint Eq a ( 
  equals : a -> a -> Bool;
  notEquals : a -> a -> Bool
);

# Basic implementations  
implement Eq Int ( 
  equals = primitive_int_eq;  # Assumes primitive comparison
  notEquals = fn a b => not (equals a b)
);
implement Eq String (
  equals = primitive_string_eq;
  notEquals = fn a b => not (equals a b)  
);
implement Eq Bool (
  equals = fn a b => match {a, b} with (
    {True, True} => True;
    {False, False} => True;
    _ => False
  );
  notEquals = fn a b => not (equals a b)
);

# Show for Option and Result
implement Show (Option a) given Show a (
  show = fn opt => match opt with (
    Some x => "Some(" + show x + ")";
    None => "None"
  )
);

implement Show (Result a b) given Show a, Show b (
  show = fn res => match res with (
    Ok x => "Ok(" + show x + ")";
    Err e => "Err(" + show e + ")"
  )
);
```

### Phase 2: Modernize Built-in Type Signatures

```typescript
// In src/typer/builtins.ts

// Replace toString with Show constraint
newEnv.set('toString', {
  type: functionType([typeVariable('a')], stringType()),
  quantifiedVars: ['a'],
  constraints: new Set(['Show']), // Add constraint requirement
});

// Update print functions to require Show
newEnv.set('print', {
  type: functionType([typeVariable('a')], typeVariable('a'), new Set(['write'])),
  quantifiedVars: ['a'],
  constraints: new Set(['Show']), // Add constraint requirement
});

newEnv.set('println', {
  type: functionType([typeVariable('a')], typeVariable('a'), new Set(['write'])),
  quantifiedVars: ['a'], 
  constraints: new Set(['Show']), // Add constraint requirement
});

// Make list_get safe by returning Option
newEnv.set('list_get', {
  type: functionType(
    [intType(), listTypeWithElement(typeVariable('a'))],
    optionType(typeVariable('a'))  // Return Option instead of raw value
  ),
  quantifiedVars: ['a'],
});
```

### Phase 3: Update Evaluator Implementations

```typescript
// In src/evaluator.ts

// Update toString to use Show constraint resolution
this.environment.set(
  'toString',
  createNativeFunction('toString', (value: Value) => {
    // This would need constraint resolution integration
    // For now, fall back to existing behavior
    return createString(valueToString(value));
  })
);

// Update list_get to return Option
this.environment.set(
  'list_get',
  createNativeFunction('list_get', (index: Value) => (list: Value) => {
    if (isNumber(index) && isList(list)) {
      const idx = index.value;
      if (idx >= 0 && idx < list.values.length) {
        return createConstructor('Some', [list.values[idx]]);
      } else {
        return createConstructor('None', []);
      }
    }
    throw new Error('list_get: invalid index or not a list');
  })
);
```

### Phase 4: Add Primitive Support Functions

Some trait implementations need primitive operations:

```typescript
// Add primitive operations that traits can use
this.environment.set(
  'primitive_int_eq',
  createNativeFunction('primitive_int_eq', (a: Value) => (b: Value) => {
    if (isNumber(a) && isNumber(b)) {
      return createBool(a.value === b.value);
    }
    return createFalse();
  })
);

this.environment.set(
  'primitive_string_eq', 
  createNativeFunction('primitive_string_eq', (a: Value) => (b: Value) => {
    if (isString(a) && isString(b)) {
      return createBool(a.value === b.value);
    }
    return createFalse();
  })
);

this.environment.set(
  'intToString',
  createNativeFunction('intToString', (n: Value) => {
    if (isNumber(n)) {
      return createString(n.value.toString());
    }
    throw new Error('intToString requires a number');
  })
);
```

## Benefits of Modernization

### 1. **Type Safety**
- `print` and `println` only work with types that can be shown
- `list_get` returns `Option` instead of potentially throwing
- Equality operations are properly constrained

### 2. **Consistency**  
- All string conversion goes through the `Show` trait
- Comparison operations use consistent `Eq` trait
- Built-ins follow the same patterns as user code

### 3. **Extensibility**
- Users can implement `Show` and `Eq` for custom types
- Automatic trait resolution for user-defined types
- Clear separation between primitive and derived operations

### 4. **Better Error Messages**
- Missing `Show` implementation gives clear constraint error
- Type-directed dispatch provides more specific error context

## Implementation Priority

### High Priority (Breaking Changes)
1. ✅ **Add core traits to stdlib.noo** - Foundation for everything else
2. **Update `print`/`println` to require `Show`** - Most visible improvement
3. **Make `list_get` return `Option`** - Safety improvement

### Medium Priority (Compatible Changes)  
4. **Add primitive support functions** - Enables trait implementations
5. **Replace `==`/`!=` with `Eq` trait** - Better polymorphism

### Low Priority (Nice to Have)
6. **Self-host more functions in Noolang** - Cleaner architecture
7. **Add `Ord` trait for ordering** - More complete trait ecosystem

## Migration Strategy

Since this involves breaking changes, we should:

1. **Add new trait-based functions alongside old ones**
2. **Deprecate old functions with warnings**  
3. **Provide migration guide for users**
4. **Update all examples and tests**

Example migration:
```noolang
# Old way (deprecated)
result = toString value;  # Works with any type

# New way (type-safe)
constraint Show MyType ( show : MyType -> String );
implement Show MyType ( show = fn x => "MyType(" + ... + ")" );
result = show value;  # Only works with Show types
```

This modernization will make Noolang's built-ins more consistent with the language's modern type system while maintaining the functional programming principles.