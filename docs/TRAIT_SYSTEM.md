# Trait System Implementation for Noolang

## Overview

This document describes the implementation of a trait system (also known as typeclasses) for Noolang. The trait system enables constrained polymorphism through type-directed dispatch, allowing for more expressive and reusable code.

## Architecture: Type-Directed Dispatch

The implementation uses **Type-Directed Dispatch** where:

1. **Constraint definitions** specify required functions and their signatures
2. **Instance definitions** provide implementations for specific types  
3. **Type checker** resolves constraint functions to specific implementations at compile time
4. **Runtime** uses pre-resolved specialized function names for direct dispatch

## Core Components

### 1. AST Extensions

#### Constraint Definition
```typescript
export interface ConstraintDefinitionExpression {
  kind: "constraint-definition";
  name: string;                    // e.g., "Monad"
  typeParam: string;               // e.g., "m"  
  functions: ConstraintFunction[]; // Required functions
  type?: Type;
  location: Location;
}

export interface ConstraintFunction {
  name: string;        // e.g., "bind"
  typeParams: string[]; // e.g., ["a", "b"]
  type: Type;          // e.g., m a -> (a -> m b) -> m b
  location: Location;
}
```

#### Implement Definition
```typescript
export interface ImplementDefinitionExpression {
  kind: "implement-definition";
  constraintName: string;              // e.g., "Monad"
  typeName: string;                    // e.g., "List"
  implementations: ImplementationFunction[];
  type?: Type;
  location: Location;
}

export interface ImplementationFunction {
  name: string;       // e.g., "bind"
  value: Expression;  // Implementation function
  location: Location;
}
```

### 2. Type System Extensions

#### Constraint Registry
```typescript
export type ConstraintSignature = {
  name: string;                      // Constraint name
  typeParam: string;                 // Type parameter name
  functions: Map<string, Type>;      // function name -> signature
};

export type ConstraintImplementation = {
  functions: Map<string, TypeScheme>; // function name -> implementation
};

export type ConstraintRegistry = Map<string, {
  signature: ConstraintSignature;
  implementations: Map<string, ConstraintImplementation>; // type name -> impl
}>;
```

#### Type State Enhancement
```typescript
export type TypeState = {
  environment: TypeEnvironment;
  substitution: Map<string, Type>;
  counter: number;
  constraints: Constraint[];
  adtRegistry: ADTRegistry;
  accessorCache: Map<string, Type>;
  constraintRegistry: ConstraintRegistry; // New: constraint tracking
};
```

### 3. Runtime Resolution

#### Constraint Function Resolution
```typescript
export const resolveConstraintFunction = (
  registry: ConstraintRegistry,
  constraintName: string,
  functionName: string,
  concreteType: Type
): TypeScheme | null => {
  const constraint = registry.get(constraintName);
  if (!constraint) return null;
  
  const typeName = typeToString(concreteType);
  const impl = constraint.implementations.get(typeName);
  return impl?.functions.get(functionName) || null;
};
```

## Syntax Design

### Constraint Definitions
```noolang
# Basic constraint
constraint Show a (
  show : a -> String
);

# Constraint with multiple functions
constraint Monad m (
  bind a b : m a -> (a -> m b) -> m b,
  pure a : a -> m a
);

# Constraint with additional type parameters
constraint Functor f (
  map a b : (a -> b) -> f a -> f b
);
```

### Implement Definitions
```noolang
# Simple implementation
implement Show Int (
  show = fn x => toString x
);

# Implementation with dependencies (future feature)
implement Show (List a) given Show a (
  show = fn xs => "[" + (join ", " (map show xs)) + "]"
);

# Complex implementation
implement Monad List (
  bind = fn xs f => flatMap f xs,
  pure = fn x => [x]
);
```

### Usage with Constraint Qualification
```noolang
# Function requiring constraint
printValue = fn x =>
  print (show x) : Show a => a -> Unit !log;

# Function with multiple constraints (future)
compareAndShow = fn x y =>
  show (compare x y) : (Eq a, Show b) => a -> a -> String;
```

## Type Checking Process

### Phase 1: Constraint Definition Processing
1. Parse constraint definition syntax
2. Create `ConstraintSignature` with function types
3. Add to `ConstraintRegistry` with empty implementations map
4. Return `Unit` type for the definition expression

### Phase 2: Implement Definition Processing  
1. Parse implement definition syntax
2. Verify constraint exists in registry
3. Type-check each implementation function
4. Verify all required functions are implemented
5. Add `ConstraintImplementation` to registry
6. Return `Unit` type for the implement expression

### Phase 3: Constraint Usage Resolution
1. When type-checking constraint function call (e.g., `show x`)
2. Determine concrete type of argument
3. Look up implementation in registry
4. Generate specialized function name (e.g., `__Show_show_Int`)
5. Add specialized function to environment
6. Type-check as normal function application

## Runtime Dispatch Strategy

### Environment Decoration
During type checking, constraint function calls are resolved to specialized implementations:

```noolang
# Source code
result = show 42;

# After type checking (internal transformation)  
result = __Show_show_Int 42;
```

### Specialized Function Naming
```typescript
const decorateConstraintCall = (
  constraintName: string,
  functionName: string,
  concreteType: Type
): string => {
  return `__${constraintName}_${functionName}_${typeToString(concreteType)}`;
};
```

### Environment Population
```typescript
// During implement definition processing
const specializedName = `__${constraintName}_${functionName}_${typeName}`;
environment.set(specializedName, implementationTypeScheme);
```

## Integration with Existing System

### Coexistence with Current Constraints
The trait system coexists with the existing `hasField` constraint system:

```noolang
# hasField constraints (current system)
getField = fn record => @field record;  # generates hasField constraint

# User-defined constraints (new trait system)
constraint Show a (
  show : a -> String
);

printField = fn record => 
  print (show (@field record)) : (Show a, hasField record field a) => record -> Unit !log;
```

### Effect System Integration
Constraint functions can have effects:

```noolang
constraint Logger a (
  log : a -> Unit !log
);

implement Logger String (
  log = fn msg => print msg
);

# Usage preserves effects
logValue = fn x =>
  log x : Logger a => a -> Unit !log;
```

## Implementation Status

### ✅ Completed
- [x] AST extensions for constraint and implement definitions
- [x] Type system registry infrastructure
- [x] Basic constraint resolution helpers
- [x] Type state enhancement with constraint registry
- [x] Integration with expression dispatcher

### 🚧 In Progress  
- [ ] Parser syntax for `constraint` and `implement` keywords
- [ ] Type inference implementation for constraint/implement definitions
- [ ] Constraint function call resolution during type checking
- [ ] Specialized function name generation and environment decoration

### 📋 Planned
- [ ] Constraint dependency resolution (`given` clause)
- [ ] Orphan implementation checking and coherence guarantees
- [ ] Better error messages for missing implementations
- [ ] Integration with import/export system
- [ ] Constraint inference for polymorphic functions
- [ ] Higher-kinded type support for advanced constraints

## Example Usage

### Complete Monad Example
```noolang
# Define the Monad constraint
constraint Monad m (
  bind a b : m a -> (a -> m b) -> m b,
  pure a : a -> m a
);

# Implement for List
implement Monad List (
  bind = fn xs f => flatMap f xs,
  pure = fn x => [x]
);

# Implement for Option
implement Monad Option (
  bind = fn opt f => match opt (
    None => None,
    Some x => f x
  ),
  pure = fn x => Some x
);

# Generic monadic function
sequence = fn actions =>
  foldr (fn action acc =>
    bind acc (fn xs =>
      bind action (fn x =>
        pure (cons x xs)
      )
    )
  ) (pure []) actions : Monad m => List (m a) -> m (List a);

# Usage
listActions = [pure 1, pure 2, pure 3];
result = sequence listActions;  # Works with List Monad

optionActions = [Some 1, Some 2, Some 3];  
result2 = sequence optionActions;  # Works with Option Monad
```

This trait system provides a solid foundation for advanced type-level programming while maintaining Noolang's focus on simplicity and LLM-friendliness.