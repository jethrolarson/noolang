import { 
  createConstraintRegistry, 
  addConstraintDefinition, 
  addConstraintImplementation,
  type ConstraintSignature,
  type ConstraintImplementation
} from '../types';
import { createTypeState } from '../type-operations';
import { 
  tryResolveConstraintFunction,
  decorateEnvironmentWithConstraintFunctions,
  resolveConstraintVariable,
  createConstraintFunctionType
} from '../constraint-resolution';
import { intType, stringType, functionType, listTypeWithElement } from '../../ast';

describe('Constraint Resolution', () => {
  test('should resolve constraint function calls', () => {
    const state = createTypeState();
    
    // Add Show constraint
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Show', showSignature);
    
    // Add Int implementation
    const intImpl: ConstraintImplementation = {
      functions: new Map([
        ['show', {
          type: functionType([intType()], stringType()),
          quantifiedVars: [],
          effects: new Set()
        }]
      ])
    };
    addConstraintImplementation(state.constraintRegistry, 'Show', 'Int', intImpl);
    
    // Try to resolve a constraint function call
    const argTypes = [intType()];
    const resolution = tryResolveConstraintFunction(
      'show',
      [], // args expressions (not used in current implementation)
      argTypes,
      state
    );
    
    expect(resolution.resolved).toBe(true);
    expect(resolution.specializedName).toBe('__Show_show_Int');
    expect(resolution.typeScheme).toBeTruthy();
  });

  test('should detect constraint variables', () => {
    const state = createTypeState();
    
    // Add Show constraint
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Show', showSignature);
    
    // Test constraint variable detection
    const resolution = resolveConstraintVariable('show', state);
    
    expect(resolution.resolved).toBe(true);
    expect(resolution.needsResolution).toBe(true);
    expect(resolution.constraintName).toBe('Show');
    expect(resolution.functionName).toBe('show');
  });

  test('should create constraint function types', () => {
    const state = createTypeState();
    
    // Add Show constraint
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Show', showSignature);
    
    // Create constraint function type
    const constraintType = createConstraintFunctionType('Show', 'show', state);
    
    expect(constraintType.kind).toBe('function');
    if (constraintType.kind === 'function') {
      expect(constraintType.params).toHaveLength(1);
      expect(constraintType.params[0]).toEqual(intType());
      expect(constraintType.return).toEqual(stringType());
    }
  });

  test('should decorate environment with specialized functions', () => {
    const state = createTypeState();
    
    // Add Show constraint and implementation
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Show', showSignature);
    
    const intImpl: ConstraintImplementation = {
      functions: new Map([
        ['show', {
          type: functionType([intType()], stringType()),
          quantifiedVars: [],
          effects: new Set()
        }]
      ])
    };
    addConstraintImplementation(state.constraintRegistry, 'Show', 'Int', intImpl);
    
    // Decorate environment
    const decoratedState = decorateEnvironmentWithConstraintFunctions(state);
    
    // Check that specialized function was added
    const specializedName = '__Show_show_Int';
    expect(decoratedState.environment.has(specializedName)).toBe(true);
    
    const specializedScheme = decoratedState.environment.get(specializedName);
    expect(specializedScheme).toBeTruthy();
    expect(specializedScheme?.type.kind).toBe('function');
  });

  test('should handle multiple constraints and implementations', () => {
    const state = createTypeState();
    
    // Add Show constraint
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Show', showSignature);
    
    // Add Eq constraint
    const eqSignature: ConstraintSignature = {
      name: 'Eq',
      typeParam: 'a',
      functions: new Map([
        ['equals', functionType([intType(), intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Eq', eqSignature);
    
    // Add implementations for both
    const showImpl: ConstraintImplementation = {
      functions: new Map([
        ['show', {
          type: functionType([intType()], stringType()),
          quantifiedVars: [],
          effects: new Set()
        }]
      ])
    };
    addConstraintImplementation(state.constraintRegistry, 'Show', 'Int', showImpl);
    
    const eqImpl: ConstraintImplementation = {
      functions: new Map([
        ['equals', {
          type: functionType([intType(), intType()], stringType()),
          quantifiedVars: [],
          effects: new Set()
        }]
      ])
    };
    addConstraintImplementation(state.constraintRegistry, 'Eq', 'Int', eqImpl);
    
    // Test resolution for both
    const showResolution = tryResolveConstraintFunction('show', [], [intType()], state);
    const eqResolution = tryResolveConstraintFunction('equals', [], [intType(), intType()], state);
    
    expect(showResolution.resolved).toBe(true);
    expect(showResolution.specializedName).toBe('__Show_show_Int');
    
    expect(eqResolution.resolved).toBe(true);
    expect(eqResolution.specializedName).toBe('__Eq_equals_Int');
  });

  test('should fail to resolve when no implementation exists', () => {
    const state = createTypeState();
    
    // Add Show constraint but no implementation
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(state.constraintRegistry, 'Show', showSignature);
    
    // Try to resolve without implementation
    const resolution = tryResolveConstraintFunction('show', [], [intType()], state);
    
    expect(resolution.resolved).toBe(false);
    expect(resolution.specializedName).toBeUndefined();
  });
});