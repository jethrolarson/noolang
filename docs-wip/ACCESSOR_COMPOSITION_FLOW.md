# Accessor Composition Type Inference Flow

## Problem Statement
When typing `fn person => @street (@address person)`, we get:
- Expected: `person -> String` 
- Actual: `person -> AddressRecord` (returns intermediate result instead of final value)

## Current Flow Analysis

### 1. Function Definition Typing (`typeFunction`)
**Location**: `src/typer/type-inference.ts:760`

When typing `fn person => @street (@address person)`:

1. **Parameter Creation**: Creates fresh type variables for parameters
   - `person` gets type variable like `α126`

2. **Body Typing**: Types the function body expression `@street (@address person)`
   - This goes through normal expression typing

3. **Constraint Collection**: Calls `collectAccessorConstraints()`
   - **Location**: `src/typer/type-inference.ts:841`
   - Analyzes the body expression for accessor patterns
   - Creates structural constraints

### 2. Expression Typing for `@street (@address person)`

This is a function application expression, so goes to `typeApplication`:
**Location**: `src/typer/function-application.ts:350`

#### Step 2a: Type the function `@street`
- `@street` is an accessor, gets typed as `a -> b given a has {@street b}`
- Uses fresh type variables for this accessor instance

#### Step 2b: Type the argument `(@address person)`
This is another function application:

##### Type the function `@address`
- `@address` is an accessor, gets typed as `c -> d given c has {@address d}`
- Uses fresh type variables for this accessor instance

##### Type the argument `person`
- `person` is a variable, looks up in environment
- Gets the parameter type variable (e.g., `α126`)

##### Apply `@address` to `person`
- Unifies parameter types
- Creates constraints for this application
- Returns some type variable for the address field

#### Step 2c: Apply `@street` to the result of `(@address person)`
- Unifies parameter types
- Creates constraints for this application
- Returns some type variable for the street field

### 3. Constraint Collection (`collectAccessorConstraints`)
**Location**: `src/typer/type-inference.ts:841`

This function analyzes the body expression and creates constraints:

#### Case 3: Composed Accessor Pattern (lines 954-1044)
Detects pattern `outerAccessor (innerAccessor param)` and creates:

1. **Inner constraint**: `paramTypeVar has {innerField: intermediateVar}`
   - E.g., `α130 has {address: α129}`

2. **Outer constraint**: `intermediateVar has {outerField: finalVar}`  
   - E.g., `α129 has {street: α127}`

**Key Issue**: Uses fresh type variables (`α130`, `α129`, `α127`) that may be different from the ones created during expression typing.

### 4. Constraint Resolution During Function Application
**Location**: `src/typer/function-application.ts:92` (`tryResolveConstraints`)

When the composed function is later applied to a concrete record:

1. **Constraint Collection**: Gathers constraints from:
   - Function-level constraints
   - Parameter-level constraints (my recent fix)

2. **Constraint Processing**: For each constraint, tries to resolve using argument types
   - Processes `has` constraints by checking if argument has required fields
   - Creates substitutions mapping type variables to actual field types

3. **Return Type Resolution**: Applies substitutions to return type

## Identified Issues

### Issue 1: Duplicate/Disconnected Constraints
- **Function constraints**: `α126 has {address: simple_var}`
- **Parameter constraints**: `α130 has {address: {street: α127}}`

Different type variables (`α126` vs `α130`) for what should be the same parameter.

### Issue 2: Variable Freshening Timing
Fresh type variables are created at multiple points:
- During expression typing (Step 2)
- During constraint collection (Step 3)
- Possibly during unification

This creates disconnected variable spaces.

### Issue 3: Constraint Resolution Chain Following
Even with correct constraints like:
- `α130 has {address: α129}`
- `α129 has {street: α127}`

The resolver doesn't follow the chain to get from return type `α127` to the final string value.

## Key Functions to Investigate

1. **`typeFunction`** (`src/typer/type-inference.ts:760`)
   - How parameters get their type variables
   - When `collectAccessorConstraints` is called

2. **`typeApplication`** (`src/typer/function-application.ts:350`)
   - How accessor applications create type variables
   - Unification order

3. **`collectAccessorConstraints`** (`src/typer/type-inference.ts:841`)
   - Case 3: Composed accessor logic
   - Variable freshening

4. **`tryResolveConstraints`** (`src/typer/function-application.ts:92`)
   - Constraint collection and processing
   - Chain resolution logic

## Questions to Answer

1. **Variable Consistency**: Should `α126` and `α130` be the same variable? When should they get unified?

2. **Constraint Source**: Are we supposed to have both function-level and parameter-level constraints, or is one redundant?

3. **Chain Resolution**: Should the resolver follow constraint chains iteratively, or should constraints be pre-composed?

4. **Freshening Strategy**: Should freshening happen once upfront, or is the current multi-phase approach correct?

## Next Steps

1. Add logging to trace variable creation and constraint generation
2. Verify unification flow between expression typing and constraint collection  
3. Test if the chain resolution fix should be in constraint creation vs resolution
4. Consider if `composeStructuralConstraints` should be used more aggressively