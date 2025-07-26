import { TypeState } from './types';
import {
	functionType,
	intType,
	boolType,
	stringType,
	floatType,
	recordType,
	tupleType,
	listTypeWithElement,
	typeVariable,
	unitType,
	optionType,
	Type,
	Effect,
	implementsConstraint,
} from '../ast';

// Helper: Create common function types
const createUnaryFunctionType = (paramType: Type, returnType: Type): Type =>
	functionType([paramType], returnType);

const createBinaryFunctionType = (
	param1Type: Type,
	param2Type: Type,
	returnType: Type
): Type => functionType([param1Type, param2Type], returnType);

// Initialize built-in types
export const initializeBuiltins = (state: TypeState): TypeState => {
	const newEnv = new Map(state.environment);

	// Addition operator - uses Add trait (supports strings)
	const addOpType = functionType(
		[typeVariable('a'), typeVariable('a')], 
		typeVariable('a'),
		new Set()
	);
	addOpType.constraints = [implementsConstraint('a', 'Add')];
	newEnv.set('+', {
		type: addOpType,
		quantifiedVars: ['a'],
	});

	// Numeric operators - use Numeric trait (numbers only)
	const subtractOpType = functionType(
		[typeVariable('a'), typeVariable('a')], 
		typeVariable('a'),
		new Set()
	);
	subtractOpType.constraints = [implementsConstraint('a', 'Numeric')];
	newEnv.set('-', {
		type: subtractOpType,
		quantifiedVars: ['a'],
	});

	const multiplyOpType = functionType(
		[typeVariable('a'), typeVariable('a')], 
		typeVariable('a'),
		new Set()
	);
	multiplyOpType.constraints = [implementsConstraint('a', 'Numeric')];
	newEnv.set('*', {
		type: multiplyOpType,
		quantifiedVars: ['a'],
	});

	// Division operator - returns Option a for safety
	const divideOpType = functionType(
		[typeVariable('a'), typeVariable('a')], 
		optionType(typeVariable('a')),
		new Set()
	);
	divideOpType.constraints = [implementsConstraint('a', 'Numeric')];
	newEnv.set('/', {
		type: divideOpType,
		quantifiedVars: ['a'],
	});

	// Comparison operators
	newEnv.set('==', {
		type: functionType([typeVariable('a'), typeVariable('a')], boolType()),
		quantifiedVars: ['a'],
	});
	newEnv.set('!=', {
		type: functionType([typeVariable('a'), typeVariable('a')], boolType()),
		quantifiedVars: ['a'],
	});
	newEnv.set('<', {
		type: functionType([intType(), intType()], boolType()),
		quantifiedVars: [],
	});
	newEnv.set('>', {
		type: functionType([intType(), intType()], boolType()),
		quantifiedVars: [],
	});
	newEnv.set('<=', {
		type: functionType([intType(), intType()], boolType()),
		quantifiedVars: [],
	});
	newEnv.set('>=', {
		type: functionType([intType(), intType()], boolType()),
		quantifiedVars: [],
	});

	const tailType = functionType(
		[listTypeWithElement(typeVariable('a'))],
		listTypeWithElement(typeVariable('a'))
	);
	newEnv.set('tail', {
		type: tailType,
		quantifiedVars: ['a'],
	});
	newEnv.set('cons', {
		type: functionType(
			[typeVariable('a'), listTypeWithElement(typeVariable('a'))],
			listTypeWithElement(typeVariable('a'))
		),
		quantifiedVars: ['a'],
	});

	// Pipeline operator (pure)
	newEnv.set('|>', {
		type: functionType(
			[typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))],
			typeVariable('b')
		),
		quantifiedVars: ['a', 'b'],
	});

	// Compose operator
	newEnv.set('<|', {
		type: functionType(
			[typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))],
			typeVariable('b')
		),
		quantifiedVars: ['a', 'b'],
	});

	// Thrush operator (pure) - same as pipeline
	newEnv.set('|', {
		type: functionType(
			[typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))],
			typeVariable('b')
		),
		quantifiedVars: ['a', 'b'],
	});

	// Semicolon operator (effectful - effects are unioned)
	newEnv.set(';', {
		type: functionType(
			[typeVariable('a'), typeVariable('b')],
			typeVariable('b')
		),
		quantifiedVars: ['a', 'b'],
	});

	// Dollar operator (low precedence function application)
	newEnv.set('$', {
		type: functionType(
			[functionType([typeVariable('a')], typeVariable('b')), typeVariable('a')],
			typeVariable('b')
		),
		quantifiedVars: ['a', 'b'],
	});

	// Effectful functions - I/O and logging
	newEnv.set('print', {
		type: functionType(
			[typeVariable('a')],
			typeVariable('a'),
			new Set(['write'])
		),
		quantifiedVars: ['a'],
	});

	newEnv.set('println', {
		type: functionType(
			[typeVariable('a')],
			typeVariable('a'),
			new Set(['write'])
		),
		quantifiedVars: ['a'],
	});

	newEnv.set('readFile', {
		type: functionType([stringType()], stringType(), new Set(['read'])),
		quantifiedVars: [],
	});

	newEnv.set('writeFile', {
		type: functionType(
			[stringType(), stringType()],
			unitType(),
			new Set(['write'])
		),
		quantifiedVars: [],
	});

	newEnv.set('log', {
		type: functionType([stringType()], unitType(), new Set(['log'])),
		quantifiedVars: [],
	});

	// Random number generation - special zero-arg function syntax
	newEnv.set('random', {
		type: intType(), // For now, treat as a value with effects
		quantifiedVars: [],
		effects: new Set(['rand'] as Effect[]), // Store effects separately
	});

	newEnv.set('randomRange', {
		type: functionType([intType(), intType()], intType(), new Set(['rand'])),
		quantifiedVars: [],
	});

	// Mutable state operations
	newEnv.set('mutSet', {
		type: functionType(
			[typeVariable('ref'), typeVariable('a')],
			unitType(),
			new Set(['state'])
		),
		quantifiedVars: ['ref', 'a'],
	});

	newEnv.set('mutGet', {
		type: functionType(
			[typeVariable('ref')],
			typeVariable('a'),
			new Set(['state'])
		),
		quantifiedVars: ['ref', 'a'],
	});

	// List utility functions (pure)
	newEnv.set('list_map', {
		type: functionType(
			[
				functionType([typeVariable('a')], typeVariable('b')),
				listTypeWithElement(typeVariable('a')),
			],
			listTypeWithElement(typeVariable('b'))
		),
		quantifiedVars: ['a', 'b'],
	});
	newEnv.set('filter', {
		type: functionType(
			[
				functionType([typeVariable('a')], boolType()),
				listTypeWithElement(typeVariable('a')),
			],
			listTypeWithElement(typeVariable('a'))
		),
		quantifiedVars: ['a'],
	});
	newEnv.set('reduce', {
		type: functionType(
			[
				functionType(
					[typeVariable('b')],
					functionType([typeVariable('a')], typeVariable('b'))
				),
				typeVariable('b'),
				listTypeWithElement(typeVariable('a')),
			],
			typeVariable('b')
		),
		quantifiedVars: ['a', 'b'],
	});
	const lengthType = createUnaryFunctionType(
		listTypeWithElement(typeVariable('a')),
		intType()
	);
	newEnv.set('length', {
		type: lengthType,
		quantifiedVars: ['a'],
	});
	newEnv.set('isEmpty', {
		type: createUnaryFunctionType(
			listTypeWithElement(typeVariable('a')),
			boolType()
		),
		quantifiedVars: ['a'],
	});
	newEnv.set('append', {
		type: createBinaryFunctionType(
			listTypeWithElement(typeVariable('a')),
			listTypeWithElement(typeVariable('a')),
			listTypeWithElement(typeVariable('a'))
		),
		quantifiedVars: ['a'],
	});

	// Math utilities (pure)
	newEnv.set('abs', {
		type: createUnaryFunctionType(intType(), intType()),
		quantifiedVars: [],
	});
	newEnv.set('max', {
		type: createBinaryFunctionType(intType(), intType(), intType()),
		quantifiedVars: [],
	});
	newEnv.set('min', {
		type: createBinaryFunctionType(intType(), intType(), intType()),
		quantifiedVars: [],
	});

	// String utilities (pure)
	newEnv.set('concat', {
		type: createBinaryFunctionType(stringType(), stringType(), stringType()),
		quantifiedVars: [],
	});
	newEnv.set('toString', {
		type: createUnaryFunctionType(typeVariable('a'), stringType()),
		quantifiedVars: ['a'],
	});
	
	// Primitive comparison functions (pure)
	newEnv.set('primitive_int_eq', {
		type: createBinaryFunctionType(intType(), intType(), boolType()),
		quantifiedVars: [],
	});
	newEnv.set('primitive_string_eq', {
		type: createBinaryFunctionType(stringType(), stringType(), boolType()),
		quantifiedVars: [],
	});

	// Primitive Add trait implementations for type checking
	newEnv.set('primitive_int_add', {
		type: createBinaryFunctionType(intType(), intType(), intType()),
		quantifiedVars: [],
	});

	newEnv.set('primitive_float_add', {
		type: createBinaryFunctionType(floatType(), floatType(), floatType()),
		quantifiedVars: [],
	});

	newEnv.set('primitive_string_concat', {
		type: createBinaryFunctionType(stringType(), stringType(), stringType()),
		quantifiedVars: [],
	});

	// Primitive Subtract trait implementations for type checking
	newEnv.set('primitive_int_subtract', {
		type: createBinaryFunctionType(intType(), intType(), intType()),
		quantifiedVars: [],
	});

	newEnv.set('primitive_float_subtract', {
		type: createBinaryFunctionType(floatType(), floatType(), floatType()),
		quantifiedVars: [],
	});

	// Primitive Multiply trait implementations for type checking
	newEnv.set('primitive_int_multiply', {
		type: createBinaryFunctionType(intType(), intType(), intType()),
		quantifiedVars: [],
	});

	newEnv.set('primitive_float_multiply', {
		type: createBinaryFunctionType(floatType(), floatType(), floatType()),
		quantifiedVars: [],
	});

	// Primitive Divide trait implementations for type checking
	newEnv.set('primitive_int_divide', {
		type: createBinaryFunctionType(intType(), intType(), optionType(intType())),
		quantifiedVars: [],
	});

	newEnv.set('primitive_float_divide', {
		type: createBinaryFunctionType(floatType(), floatType(), optionType(floatType())),
		quantifiedVars: [],
	});

	// Record utilities
	newEnv.set('hasKey', {
		type: createBinaryFunctionType(recordType({}), stringType(), boolType()),
		quantifiedVars: [],
	});
	newEnv.set('hasValue', {
		type: createBinaryFunctionType(
			recordType({}),
			typeVariable('a'),
			boolType()
		),
		quantifiedVars: ['a'],
	});
	newEnv.set('set', {
		type: functionType(
			[
				typeVariable('accessor'), // Accept any accessor function type
				recordType({}),
				typeVariable('a'),
			],
			recordType({})
		),
		quantifiedVars: ['accessor', 'a'],
	});

	// Tuple operations - only keep sound ones
	newEnv.set(
		'tupleLength',
		{ type: functionType([tupleType([])], intType()), quantifiedVars: [] } // Any tuple -> Int
	);
	newEnv.set(
		'tupleIsEmpty',
		{ type: functionType([tupleType([])], boolType()), quantifiedVars: [] } // Any tuple -> Bool
	);

	// head function is now self-hosted in stdlib.noo

	// Minimal built-in for self-hosted functions - now returns Option for safety
	newEnv.set('list_get', {
		type: functionType(
			[intType(), listTypeWithElement(typeVariable('a'))],
			optionType(typeVariable('a'))
		),
		quantifiedVars: ['a'],
	});

	const newState = { ...state, environment: newEnv };
	
	// Register basic trait implementations to avoid loading order issues
	const { addTraitDefinition, addTraitImplementation } = require('./trait-system');
	
	// Add the Add trait definition if not already present
	if (!newState.traitRegistry.definitions.has('Add')) {
		addTraitDefinition(newState.traitRegistry, {
			name: 'Add',
			typeParam: 'a',
			functions: new Map([['add', functionType([typeVariable('a'), typeVariable('a')], typeVariable('a'))]])
		});
	}

	// Add the Numeric trait definition if not already present
	if (!newState.traitRegistry.definitions.has('Numeric')) {
		addTraitDefinition(newState.traitRegistry, {
			name: 'Numeric',
			typeParam: 'a',
			functions: new Map([
				['subtract', functionType([typeVariable('a'), typeVariable('a')], typeVariable('a'))],
				['multiply', functionType([typeVariable('a'), typeVariable('a')], typeVariable('a'))],
				['divide', functionType([typeVariable('a'), typeVariable('a')], optionType(typeVariable('a')))]
			])
		});
	}
	
	// Basic trait implementations are handled directly in constraint resolution
	// to avoid circular dependency issues with primitive function loading
	
	return newState;
};
