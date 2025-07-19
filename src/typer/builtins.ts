import { TypeState } from './types';
import {
	functionType,
	intType,
	boolType,
	stringType,
	recordType,
	tupleType,
	listTypeWithElement,
	typeVariable,
	unitType,
	Type,
	Effect,
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

	// Arithmetic operators
	newEnv.set('+', {
		type: functionType([intType(), intType()], intType()),
		quantifiedVars: [],
	});
	newEnv.set('-', {
		type: functionType([intType(), intType()], intType()),
		quantifiedVars: [],
	});
	newEnv.set('*', {
		type: functionType([intType(), intType()], intType()),
		quantifiedVars: [],
	});
	newEnv.set('/', {
		type: functionType([intType(), intType()], intType()),
		quantifiedVars: [],
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
		quantifiedVars: [],
	});

	// Pipeline operator (pure)
	newEnv.set('|>', {
		type: functionType(
			[typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))],
			typeVariable('b')
		),
		quantifiedVars: [],
	});

	// Compose operator
	newEnv.set('<|', {
		type: functionType(
			[typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))],
			typeVariable('b')
		),
		quantifiedVars: [],
	});

	// Thrush operator (pure) - same as pipeline
	newEnv.set('|', {
		type: functionType(
			[typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))],
			typeVariable('b')
		),
		quantifiedVars: [],
	});

	// Semicolon operator (effectful - effects are unioned)
	newEnv.set(';', {
		type: functionType(
			[typeVariable('a'), typeVariable('b')],
			typeVariable('b')
		),
		quantifiedVars: [],
	});

	// Dollar operator (low precedence function application)
	newEnv.set('$', {
		type: functionType(
			[functionType([typeVariable('a')], typeVariable('b')), typeVariable('a')],
			typeVariable('b')
		),
		quantifiedVars: [],
	});

	// Effectful functions - I/O and logging
	newEnv.set('print', {
		type: functionType(
			[typeVariable('a')],
			typeVariable('a'),
			new Set(['log'])
		),
		quantifiedVars: [],
	});

	newEnv.set('println', {
		type: functionType(
			[typeVariable('a')],
			typeVariable('a'),
			new Set(['log'])
		),
		quantifiedVars: [],
	});

	newEnv.set('readFile', {
		type: functionType(
			[stringType()],
			stringType(),
			new Set(['io'])
		),
		quantifiedVars: [],
	});

	newEnv.set('writeFile', {
		type: functionType(
			[stringType(), stringType()],
			unitType(),
			new Set(['io'])
		),
		quantifiedVars: [],
	});

	newEnv.set('log', {
		type: functionType(
			[stringType()],
			unitType(),
			new Set(['log'])
		),
		quantifiedVars: [],
	});

	// Random number generation - special zero-arg function syntax
	newEnv.set('random', {
		type: intType(), // For now, treat as a value with effects
		quantifiedVars: [],
		effects: new Set(['rand'] as Effect[])  // Store effects separately
	});

	newEnv.set('randomRange', {
		type: functionType(
			[intType(), intType()],
			intType(),
			new Set(['rand'])
		),
		quantifiedVars: [],
	});

	// Error throwing (throws exceptions)
	newEnv.set('throw', {
		type: functionType(
			[stringType()],
			typeVariable('a'),
			new Set(['err'])
		),
		quantifiedVars: ['a'],
	});

	// Mutation effects for future mutable data structures
	newEnv.set('mutSet', {
		type: functionType(
			[typeVariable('ref'), typeVariable('a')],
			unitType(),
			new Set(['mut'])
		),
		quantifiedVars: ['ref', 'a'],
	});

	newEnv.set('mutGet', {
		type: functionType(
			[typeVariable('ref')],
			typeVariable('a'),
			new Set(['mut'])
		),
		quantifiedVars: ['ref', 'a'],
	});

	// List utility functions (pure)
	newEnv.set('map', {
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
		quantifiedVars: [],
	});
	newEnv.set('append', {
		type: createBinaryFunctionType(
			listTypeWithElement(typeVariable('a')),
			listTypeWithElement(typeVariable('a')),
			listTypeWithElement(typeVariable('a'))
		),
		quantifiedVars: [],
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
		quantifiedVars: [],
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
		quantifiedVars: [],
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

	// Built-in ADT constructors
	// Option type constructors
	const optionType = (elementType: Type): Type => ({
		kind: 'variant',
		name: 'Option',
		args: [elementType],
	});

	newEnv.set('Some', {
		type: functionType([typeVariable('a')], optionType(typeVariable('a'))),
		quantifiedVars: ['a'],
	});

	newEnv.set('None', {
		type: optionType(typeVariable('a')),
		quantifiedVars: ['a'],
	});

	// head function is now self-hosted in stdlib.noo

	// Minimal built-in for self-hosted functions
	newEnv.set('list_get', {
		type: functionType(
			[intType(), listTypeWithElement(typeVariable('a'))],
			typeVariable('a')
		),
		quantifiedVars: ['a'],
	});

	// Result type constructors
	const resultType = (successType: Type, errorType: Type): Type => ({
		kind: 'variant',
		name: 'Result',
		args: [successType, errorType],
	});

	newEnv.set('Ok', {
		type: functionType(
			[typeVariable('a')],
			resultType(typeVariable('a'), typeVariable('b'))
		),
		quantifiedVars: ['a', 'b'],
	});

	newEnv.set('Err', {
		type: functionType(
			[typeVariable('b')],
			resultType(typeVariable('a'), typeVariable('b'))
		),
		quantifiedVars: ['a', 'b'],
	});

	// Register ADTs in the registry
	const newRegistry = new Map(state.adtRegistry);

	newRegistry.set('Option', {
		typeParams: ['a'],
		constructors: new Map([
			['Some', [typeVariable('a')]],
			['None', []],
		]),
	});

	newRegistry.set('Result', {
		typeParams: ['a', 'b'],
		constructors: new Map([
			['Ok', [typeVariable('a')]],
			['Err', [typeVariable('b')]],
		]),
	});

	// Utility functions for Option and Result
	// Option utilities
	newEnv.set('isSome', {
		type: functionType([optionType(typeVariable('a'))], boolType()),
		quantifiedVars: ['a'],
	});

	newEnv.set('isNone', {
		type: functionType([optionType(typeVariable('a'))], boolType()),
		quantifiedVars: ['a'],
	});

	newEnv.set('unwrap', {
		type: functionType([optionType(typeVariable('a'))], typeVariable('a')),
		quantifiedVars: ['a'],
	});

	// Result utilities
	newEnv.set('isOk', {
		type: functionType(
			[resultType(typeVariable('a'), typeVariable('b'))],
			boolType()
		),
		quantifiedVars: ['a', 'b'],
	});

	newEnv.set('isErr', {
		type: functionType(
			[resultType(typeVariable('a'), typeVariable('b'))],
			boolType()
		),
		quantifiedVars: ['a', 'b'],
	});

	return { ...state, environment: newEnv, adtRegistry: newRegistry };
};
