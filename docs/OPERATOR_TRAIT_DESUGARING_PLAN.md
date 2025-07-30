# Operator to Trait Desugaring Implementation Plan

## Overview

Convert Noolang's hardcoded binary operators (`+`, `-`, `*`, `/`) to proper trait function desugaring while preserving error message quality and maintaining architectural cleanliness.

## Current State Analysis

### What Works
- ✅ Trait system exists (`Add`, `Numeric` traits defined)
- ✅ Trait function resolution works (`add`, `subtract`, `multiply`, `divide`)
- ✅ Evaluator already falls back to trait functions for complex types
- ✅ `BinaryExpression` AST preserves user intent

### What's Broken
- ❌ Operators hardcoded in `builtins.ts` with manual constraint assignment
- ❌ Constraint inference duplicates operator→constraint mapping
- ❌ Type checking uses hardcoded operator types instead of trait functions
- ❌ No extensibility for user-defined operators

## Implementation Plan

### Phase 1: Create Operator→Trait Mapping System

**File: `src/typer/operator-traits.ts` (new)**

```typescript
// Central mapping of operators to trait functions
export interface OperatorMapping {
  operator: string;
  traitName: string;
  functionName: string;
  precedence?: number;
}

export const OPERATOR_MAPPINGS: OperatorMapping[] = [
  { operator: '+', traitName: 'Add', functionName: 'add' },
  { operator: '-', traitName: 'Sub', functionName: 'subtract' },
  { operator: '*', traitName: 'Mul', functionName: 'multiply' },
  { operator: '/', traitName: 'Div', functionName: 'divide' },
];

export function getOperatorMapping(operator: string): OperatorMapping | null {
  return OPERATOR_MAPPINGS.find(m => m.operator === operator) || null;
}

export function getRequiredTrait(operator: string): string | null {
  const mapping = getOperatorMapping(operator);
  return mapping ? mapping.traitName : null;
}
```

### Phase 2: Update Trait Definitions

**File: `src/typer/builtins.ts`**

**Remove:**
```typescript
// Addition operator - uses Add trait (supports strings)
const addOpType = functionType(/*...*/);
addOpType.constraints = [implementsConstraint('a', 'Add')];
newEnv.set('+', { type: addOpType, quantifiedVars: ['a'] });

// Subtraction, multiplication, division operators...
```

**Keep only:**
```typescript
// Add trait definitions (these stay)
addTraitDefinition(newState.traitRegistry, {
  name: 'Add',
  typeParam: 'a',
  functions: new Map([['add', functionType([typeVariable('a'), typeVariable('a')], typeVariable('a'))]])
});
```

**Add new trait definitions:**
```typescript
// Split Numeric into individual operation traits
addTraitDefinition(newState.traitRegistry, {
  name: 'Sub',
  typeParam: 'a', 
  functions: new Map([['subtract', functionType([typeVariable('a'), typeVariable('a')], typeVariable('a'))]])
});

addTraitDefinition(newState.traitRegistry, {
  name: 'Mul',
  typeParam: 'a',
  functions: new Map([['multiply', functionType([typeVariable('a'), typeVariable('a')], typeVariable('a'))]])
});

addTraitDefinition(newState.traitRegistry, {
  name: 'Div', 
  typeParam: 'a',
  functions: new Map([['divide', functionType([typeVariable('a'), typeVariable('a')], optionType(typeVariable('a')))]])
});
```

### Phase 3: Modify Binary Expression Type Checking

**File: `src/typer/type-inference.ts`**

**Replace the operator lookup section in `typeBinary`:**

```typescript
// OLD: Get operator type from environment
const operatorScheme = currentState.environment.get(expr.operator);
if (!operatorScheme) {
  throw new Error(`Unknown operator: ${expr.operator}`);
}

// NEW: Map operator to trait function
const operatorMapping = getOperatorMapping(expr.operator);
if (!operatorMapping) {
  // Not a trait-based operator, handle as before (|, ;, etc.)
  const operatorScheme = currentState.environment.get(expr.operator);
  if (!operatorScheme) {
    throw new Error(`Unknown operator: ${expr.operator}`);
  }
  // ... existing logic
  return;
}

// Desugar to trait function call
const syntheticCall: ApplicationExpression = {
  kind: 'application',
  func: { 
    kind: 'variable', 
    name: operatorMapping.functionName,
    location: expr.location 
  },
  args: [expr.left, expr.right],
  location: expr.location,
  originalOperator: expr.operator  // Preserve for error messages
};

// Type check as function application
const result = typeApplication(syntheticCall, currentState);

// Enhance error messages to reference original operator
try {
  return result;
} catch (error) {
  if (error.message.includes(operatorMapping.functionName)) {
    // Replace trait function name with operator in error message
    const enhancedMessage = error.message.replace(
      new RegExp(operatorMapping.functionName, 'g'), 
      expr.operator
    );
    throw new Error(enhancedMessage);
  }
  throw error;
}
```

### Phase 4: Simplify Constraint Inference

**File: `src/typer/type-inference.ts`**

**Replace the complex `analyzeOperatorConstraints` with:**

```typescript
// Simplified constraint inference using operator mappings
function collectImplicitConstraints(
  bodyAST: Expression,
  params: string[],
  bodyType: Type, 
  paramTypes: Type[], 
  state: TypeState
): Constraint[] {
  const constraints: Constraint[] = [];
  const usedTraits = findUsedTraits(bodyAST);
  
  if (usedTraits.size > 0) {
    // Get the first type variable to add constraints to
    const allTypeVars = new Set<string>();
    for (const paramType of paramTypes) {
      collectTypeVariables(paramType, allTypeVars);
    }
    
    if (allTypeVars.size > 0) {
      const firstTypeVar = Array.from(allTypeVars).sort()[0];
      
      for (const traitName of usedTraits) {
        constraints.push(implementsConstraint(firstTypeVar, traitName));
      }
    }
  }
  
  return constraints;
}

// Find which traits are used based on operators in the AST
function findUsedTraits(expr: Expression): Set<string> {
  const usedTraits = new Set<string>();
  
  function analyzeExpression(e: Expression): void {
    if (!e) return;
    
    switch (e.kind) {
      case 'binary':
        const traitName = getRequiredTrait(e.operator);
        if (traitName) {
          usedTraits.add(traitName);
        }
        analyzeExpression(e.left);
        analyzeExpression(e.right);
        break;
        
      case 'application':
        analyzeExpression(e.func);
        e.args.forEach(analyzeExpression);
        break;
        
      case 'function':
        analyzeExpression(e.body);
        break;
        
      // ... other cases
    }
  }
  
  analyzeExpression(expr);
  return usedTraits;
}
```

### Phase 5: Update Evaluator

**File: `src/evaluator/evaluator.ts`**

**The evaluator already handles trait fallback, but we can simplify:**

```typescript
// In evaluateBinary, replace hardcoded checks with mapping
const operatorMapping = getOperatorMapping(expr.operator);
if (operatorMapping) {
  // Always use trait function (remove hardcoded Float/String special cases)
  if (this.traitRegistry && this.isTraitFunction(operatorMapping.functionName)) {
    try {
      return this.resolveTraitFunctionWithArgs(
        operatorMapping.functionName, 
        [leftVal, rightVal], 
        this.traitRegistry
      );
    } catch (e) {
      throw new Error(
        `Cannot use ${expr.operator} with ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
      );
    }
  }
  
  throw new Error(`${operatorMapping.traitName} trait not available for operator ${expr.operator}`);
}

// Handle non-trait operators (|, ;, etc.) as before
```

### Phase 6: Enhanced Error Messages

**File: `src/typer/type-errors.ts` (new functions)**

```typescript
export function createOperatorTypeError(
  operator: string,
  leftType: Type,
  rightType: Type,
  requiredTrait: string,
  location?: Location
): TypeError {
  return createTypeError(
    `Type mismatch in ${getOperatorDescription(operator)}
  Left operand:  ${typeToString(leftType)}
  Right operand: ${typeToString(rightType)}
  
${operator} requires both operands to be the same type that implements ${requiredTrait}
Available ${requiredTrait} implementations: ${getAvailableImplementations(requiredTrait)}`,
    {},
    location || { line: 1, column: 1 }
  );
}

function getOperatorDescription(operator: string): string {
  switch (operator) {
    case '+': return 'addition';
    case '-': return 'subtraction';  
    case '*': return 'multiplication';
    case '/': return 'division';
    default: return `operator ${operator}`;
  }
}
```

### Phase 7: Testing Strategy

**Update existing tests:**
1. **Constraint inference tests** - verify operators map to correct traits
2. **Binary operator tests** - ensure behavior unchanged
3. **Error message tests** - verify improved error messages
4. **Trait resolution tests** - confirm operator→trait mapping works

**New tests:**
```typescript
// Test operator trait mapping
test('operator + maps to Add trait', () => {
  const mapping = getOperatorMapping('+');
  assert.equal(mapping?.traitName, 'Add');
  assert.equal(mapping?.functionName, 'add');
});

// Test constraint inference with operators  
test('function using + gets Add constraint', () => {
  const code = 'f = fn x y => x + y';
  const result = typeAndDecorate(parse(lex(code)));
  const constraints = result.finalType.constraints;
  assert.ok(constraints.some(c => c.trait === 'Add'));
});

// Test error messages reference operators, not trait functions
test('error messages show + not add', () => {
  const code = 'f = 1 + "hello"';
  assert.throws(() => typeAndDecorate(parse(lex(code))), /cannot use \+/i);
});
```

## Migration Strategy

### Step 1: Implement mapping system (Phase 1)
- No breaking changes
- Pure addition of new functionality

### Step 2: Update type checking (Phase 3) 
- Test with existing operator tests
- Ensure backward compatibility

### Step 3: Remove hardcoded operators (Phase 2)
- This is the breaking change
- Run full test suite

### Step 4: Clean up evaluator and add error improvements (Phases 5-6)
- Polish and optimization

## Benefits After Implementation

1. **Architectural cleanliness**: Operators are just syntax sugar for trait functions
2. **Extensibility**: Users can define new operators by defining trait functions
3. **Maintainability**: Single source of truth for operator semantics
4. **Better error messages**: Reference user's actual syntax
5. **Simplified constraint inference**: No duplication of operator logic

## Risks and Mitigation

**Risk**: Breaking existing code that depends on hardcoded operators
**Mitigation**: Comprehensive test coverage, implement mapping first

**Risk**: Performance regression from trait function overhead
**Mitigation**: Profile before/after, optimize trait resolution if needed

**Risk**: Complex error message handling
**Mitigation**: Implement enhanced error messages incrementally

## Success Criteria

- [ ] All existing operator tests pass
- [ ] Constraint inference tests pass with simplified logic  
- [ ] Error messages improved (show operators, not trait functions)
- [ ] No performance regression
- [ ] Clean architecture (no operator hardcoding)
- [ ] Extensible (new operators can be added via traits)