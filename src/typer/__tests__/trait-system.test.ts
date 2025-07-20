import { 
  createConstraintRegistry, 
  addConstraintDefinition, 
  addConstraintImplementation, 
  resolveConstraintFunction,
  getConstraintSignature,
  type ConstraintSignature,
  type ConstraintImplementation
} from '../types';
import { intType, stringType, functionType, listTypeWithElement } from '../../ast';

describe('Trait System Infrastructure', () => {
  test('should create empty constraint registry', () => {
    const registry = createConstraintRegistry();
    expect(registry.size).toBe(0);
  });

  test('should add constraint definition', () => {
    const registry = createConstraintRegistry();
    
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };

    addConstraintDefinition(registry, 'Show', showSignature);
    
    expect(registry.size).toBe(1);
    expect(registry.has('Show')).toBe(true);
    
    const constraint = registry.get('Show');
    expect(constraint?.signature.name).toBe('Show');
    expect(constraint?.signature.typeParam).toBe('a');
    expect(constraint?.implementations.size).toBe(0);
  });

  test('should add constraint implementation', () => {
    const registry = createConstraintRegistry();
    
    // Add constraint definition first
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a', 
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(registry, 'Show', showSignature);

    // Add implementation
    const implementation: ConstraintImplementation = {
      functions: new Map([
        ['show', {
          type: functionType([intType()], stringType()),
          quantifiedVars: [],
          effects: new Set()
        }]
      ])
    };

    const success = addConstraintImplementation(registry, 'Show', 'Int', implementation);
    
    expect(success).toBe(true);
    
    const constraint = registry.get('Show');
    expect(constraint?.implementations.size).toBe(1);
    expect(constraint?.implementations.has('Int')).toBe(true);
  });

  test('should fail to add implementation for non-existent constraint', () => {
    const registry = createConstraintRegistry();
    
    const implementation: ConstraintImplementation = {
      functions: new Map([
        ['show', {
          type: functionType([intType()], stringType()),
          quantifiedVars: [],
          effects: new Set()
        }]
      ])
    };

    const success = addConstraintImplementation(registry, 'NonExistent', 'Int', implementation);
    
    expect(success).toBe(false);
  });

  test('should resolve constraint function', () => {
    const registry = createConstraintRegistry();
    
    // Set up constraint
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(registry, 'Show', showSignature);

    // Add implementation  
    const showImpl = {
      type: functionType([intType()], stringType()),
      quantifiedVars: [],
      effects: new Set<import('../../ast').Effect>()
    };
    const implementation: ConstraintImplementation = {
      functions: new Map([['show', showImpl]])
    };
    addConstraintImplementation(registry, 'Show', 'Int', implementation);

    // Resolve function
    const resolved = resolveConstraintFunction(registry, 'Show', 'show', intType());
    
    expect(resolved).toBeTruthy();
    expect(resolved?.type).toEqual(functionType([intType()], stringType()));
  });

  test('should return null for unresolved constraint function', () => {
    const registry = createConstraintRegistry();
    
    const resolved = resolveConstraintFunction(registry, 'NonExistent', 'show', intType());
    
    expect(resolved).toBeNull();
  });

  test('should get constraint signature', () => {
    const registry = createConstraintRegistry();
    
    const showSignature: ConstraintSignature = {
      name: 'Show',
      typeParam: 'a',
      functions: new Map([
        ['show', functionType([intType()], stringType())]
      ])
    };
    addConstraintDefinition(registry, 'Show', showSignature);

    const retrieved = getConstraintSignature(registry, 'Show');
    
    expect(retrieved).toBeTruthy();
    expect(retrieved?.name).toBe('Show');
    expect(retrieved?.typeParam).toBe('a');
    expect(retrieved?.functions.get('show')).toEqual(functionType([intType()], stringType()));
  });

  test('should handle complex constraint with multiple functions', () => {
    const registry = createConstraintRegistry();
    
    // Define Monad constraint
    const monadSignature: ConstraintSignature = {
      name: 'Monad',
      typeParam: 'm',
      functions: new Map([
        ['bind', functionType([
          listTypeWithElement(intType()), 
          functionType([intType()], listTypeWithElement(intType()))
        ], listTypeWithElement(intType()))],
        ['pure', functionType([intType()], listTypeWithElement(intType()))]
      ])
    };
    addConstraintDefinition(registry, 'Monad', monadSignature);

    // Add List implementation
    const listImpl: ConstraintImplementation = {
      functions: new Map([
        ['bind', {
          type: functionType([
            listTypeWithElement(intType()), 
            functionType([intType()], listTypeWithElement(intType()))
          ], listTypeWithElement(intType())),
          quantifiedVars: ['a', 'b'],
          effects: new Set()
        }],
        ['pure', {
          type: functionType([intType()], listTypeWithElement(intType())),
          quantifiedVars: ['a'], 
          effects: new Set()
        }]
      ])
    };
    addConstraintImplementation(registry, 'Monad', 'List Int', listImpl);

    // Test resolution
    const bindResolved = resolveConstraintFunction(
      registry, 
      'Monad', 
      'bind', 
      listTypeWithElement(intType())
    );
    const pureResolved = resolveConstraintFunction(
      registry,
      'Monad', 
      'pure',
      listTypeWithElement(intType())
    );

    expect(bindResolved).toBeTruthy();
    expect(pureResolved).toBeTruthy();
    expect(bindResolved?.quantifiedVars).toEqual(['a', 'b']);
    expect(pureResolved?.quantifiedVars).toEqual(['a']);
  });
});