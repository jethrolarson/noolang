# Pattern Matching Design for Tuples and Records

## Overview

This document outlines the design for extending Noolang's existing pattern matching system to support tuple and record patterns in `match` expressions.

## Current State

Noolang already has a complete pattern matching system for ADTs with these pattern types:
- `constructor` - ADT constructors like `Some x`, `Point x y`
- `variable` - variable bindings like `x`
- `literal` - literal values like `1`, `"hello"`
- `wildcard` - wildcard `_` patterns

## Design Philosophy

- **Consistency**: Use the same comma-separated syntax as data structure literals
- **Safety**: Compile-time validation of pattern structure
- **Ergonomics**: Natural, readable patterns for common data access
- **LLM-Friendly**: Clear, predictable syntax patterns

## Syntax Design

### Tuple Patterns

Match tuples by position with comma-separated patterns:

```noolang
# Basic tuple matching
match point (
  {x, y} => x + y;
  _ => 0
)

# Mixed pattern types
match data (
  {1, name} => name;           # First element literal 1, bind second to name
  {_, "default"} => "found";   # Wildcard first, literal second
  {x, y} => "other"            # Bind both elements
)

# Nested tuple patterns
match nested (
  {x, {inner, rest}} => inner + rest;
  _ => 0
)

# Single element tuples (edge case)
match single (
  {value} => value;
  _ => 0
)
```

### Record Patterns

Match records by field name with `@field` patterns:

```noolang
# Basic record matching
match person (
  {@name "Alice", @age 30} => "Found Alice";
  {@name n, @age a} => n + " is " + (toString a);
  _ => "Unknown person"
)

# Partial record matching (only specified fields matter)
match user (
  {@name "admin"} => "Administrator";  # Other fields ignored
  {@name n} => "User: " + n
)

# Nested record patterns
match complex (
  {@user {@name "Alice"}, @status "active"} => "Active Alice";
  {@user {@name n}, @status s} => n + " is " + s;
  _ => "Unknown"
)

# Mixed field patterns
match data (
  {@id 123, @name n} => "Special user: " + n;
  {@id i, @name "guest"} => "Guest #" + (toString i);
  {@id i, @name n} => n + " #" + (toString i)
)
```

## Grammar Extensions

### Tuple Pattern Grammar
```
tuple_pattern := '{' pattern_list '}'
pattern_list := pattern (',' pattern)*
```

### Record Pattern Grammar
```
record_pattern := '{' record_pattern_list '}'
record_pattern_list := record_field_pattern (',' record_field_pattern)*
record_field_pattern := '@' identifier pattern
```

## Type Safety

### Tuple Pattern Validation
- **Length checking**: Pattern length must match tuple type length
- **Element types**: Each pattern position must unify with corresponding tuple element type
- **Exhaustiveness**: Compiler warns if not all tuple structures are covered

### Record Pattern Validation  
- **Field existence**: All pattern fields must exist in the record type
- **Field types**: Pattern types must unify with record field types
- **Duck typing preserved**: Records with extra fields still match (consistent with current behavior)

## Implementation Plan

### Phase 1: AST Extensions
Add new pattern types to the `Pattern` union type:

```typescript
export type Pattern =
  | { kind: 'constructor'; name: string; args: Pattern[]; location: Location }
  | { kind: 'variable'; name: string; location: Location }
  | { kind: 'literal'; value: number | string | boolean; location: Location }
  | { kind: 'wildcard'; location: Location }
  | { kind: 'tuple'; elements: Pattern[]; location: Location }        // NEW
  | { kind: 'record'; fields: RecordPatternField[]; location: Location }; // NEW

export interface RecordPatternField {
  fieldName: string;  // Without @ prefix
  pattern: Pattern;
  location: Location;
}
```

### Phase 2: Parser Extensions
Extend the pattern parser to recognize tuple and record syntax:

```typescript
// In parser.ts, extend parsePattern()
const parsePattern = (): Pattern => {
  // ... existing constructor, variable, literal, wildcard parsing
  
  // Add tuple pattern parsing
  if (current()?.type === 'LBRACE') {
    return parseTupleOrRecordPattern();
  }
  
  // ... rest of parser
};

const parseTupleOrRecordPattern = (): Pattern => {
  // Parse { ... } and determine if tuple or record based on first element
  // If first element starts with @, it's a record pattern
  // Otherwise it's a tuple pattern
};
```

### Phase 3: Type System Integration
Extend pattern matching type inference in `src/typer/pattern-matching.ts`:

```typescript
const typePattern = (pattern: Pattern, expectedType: Type, state: TypeState) => {
  switch (pattern.kind) {
    // ... existing cases
    
    case 'tuple': {
      // Validate expected type is tuple
      // Unify each pattern element with corresponding tuple element type
      // Return bindings from all sub-patterns
    }
    
    case 'record': {
      // Validate expected type is record (or type variable)
      // Check all pattern fields exist in record type
      // Unify each pattern with corresponding field type
      // Return bindings from all sub-patterns
    }
  }
};
```

### Phase 4: Evaluator Integration
Extend pattern matching evaluation in `src/evaluator.ts`:

```typescript
const matchesPattern = (pattern: Pattern, value: any, env: Environment): boolean => {
  switch (pattern.kind) {
    // ... existing cases
    
    case 'tuple': {
      // Check value is tuple with correct length
      // Recursively match each element pattern
    }
    
    case 'record': {
      // Check value is record with required fields
      // Recursively match each field pattern
    }
  }
};
```

## Examples

### Complete Match Examples

```noolang
# Tuple matching for coordinate systems
processPoint = fn point => match point (
  {0, 0} => "origin";
  {x, 0} => "on x-axis: " + (toString x);
  {0, y} => "on y-axis: " + (toString y);
  {x, y} => "point: (" + (toString x) + ", " + (toString y) + ")"
);

# Record matching for user processing
processUser = fn user => match user (
  {@role "admin", @name n} => "Administrator: " + n;
  {@role "user", @active True, @name n} => "Active user: " + n;
  {@role "user", @active False, @name n} => "Inactive user: " + n;
  {@name n} => "Basic user: " + n;  # Matches any record with @name
  _ => "Invalid user"
);

# Mixed ADT and data structure patterns
processData = fn data => match data (
  Some {x, y} => "Point: " + (toString x) + ", " + (toString y);
  Some {@name n, @value v} => n + " = " + (toString v);
  Some value => "Other: " + (toString value);
  None => "No data"
);
```

## Benefits

1. **Ergonomic Data Access**: Natural syntax for extracting values from complex data
2. **Type Safety**: Compile-time validation of pattern structure and types
3. **Consistency**: Matches existing data structure syntax using commas
4. **Flexibility**: Supports partial matching for records (duck typing preserved)
5. **Composability**: Patterns can be nested and combined with existing ADT patterns

## Future Extensions

### Optional Field Patterns (Future)
```noolang
# Optional field matching with |? operator integration
match user (
  {@email? email} => "Email: " + (email |? toString | option_get_or "none");
  _ => "No email"
)
```

### Pattern Guards (Future)
```noolang
# Pattern guards for additional conditions
match point (
  {x, y} when x > 0 and y > 0 => "positive quadrant";
  {x, y} => "other quadrant"
)
```

### Rest Patterns (Future)
```noolang
# Rest patterns for ignoring remaining fields
match record (
  {@name n, ...} => "Name: " + n;  # Ignore other fields
  _ => "No name"
)
```

## Testing Strategy

### Unit Tests
- Parser tests for tuple and record pattern syntax
- Type inference tests for pattern unification
- Evaluator tests for pattern matching execution
- Error handling tests for malformed patterns

### Integration Tests
- Complex nested pattern scenarios
- Mixed ADT and data structure patterns
- Duck typing behavior with record patterns
- Performance tests with large data structures

### Example Programs
- Coordinate system processing with tuple patterns
- User data processing with record patterns
- JSON-like data manipulation combining both pattern types

## Implementation Status

- ✅ **AST Extensions** - Added `tuple` and `record` pattern types to Pattern union with RecordPatternField interface
- ✅ **Parser Extensions** - Full support for `{pattern, pattern}` and `{@field pattern}` syntax with mixed literal/variable patterns
- ✅ **Type System Integration** - Complete type checking for tuple/record patterns with proper type inference and unification
- ✅ **Evaluator Support** - Runtime pattern matching for tuples/records with correct binding and duck typing
- ✅ **Constructor Integration** - Support for constructor patterns with tuple/record arguments (e.g., `Some {x, y}`)
- ✅ **Test Coverage** - Comprehensive test suite with 10/10 tests passing covering all pattern types
- ✅ **Documentation** - Updated README with extensive examples and pattern matching sections

## ✅ Implementation Complete

This feature is now fully implemented and integrated into Noolang. All functionality described in this design document is working correctly:

- Tuple patterns: `{x, y, z}` with literal/variable mixing
- Record patterns: `{@field pattern}` with partial matching support  
- Nested patterns: Complex combinations with ADT constructors
- Type safety: Full compile-time validation and inference
- Runtime execution: Correct pattern matching and variable binding

The implementation maintains consistency with existing language patterns and provides a solid foundation for future pattern matching extensions.