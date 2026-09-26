import type { Environment } from '../evaluator-utils';
import { registerCollectionBuiltins } from './collections';
import { registerCoreBuiltins } from './core';
import { registerEffectBuiltins, registerPrintBuiltin } from './effects';
import { registerPrimitiveBuiltins } from './primitives';
import {
	registerMathBuiltins,
	registerStringRecordBuiltins,
} from './strings-records';
import type { BuiltinDependencies } from './types';

export const createBuiltinEnvironment = (
	dependencies: BuiltinDependencies
): Environment => {
	const environment: Environment = new Map();
	registerCoreBuiltins(environment, dependencies);
	registerCollectionBuiltins(environment, dependencies);
	registerMathBuiltins(environment);
	registerPrintBuiltin(environment);
	registerStringRecordBuiltins(environment, dependencies);
	registerEffectBuiltins(environment, dependencies);
	registerPrimitiveBuiltins(environment, dependencies);
	return environment;
};
