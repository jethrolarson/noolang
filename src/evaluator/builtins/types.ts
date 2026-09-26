import type * as NodeFs from 'node:fs';
import type { TraitRegistry } from '../../typer/trait-system';
import type { TraitFunctionValue, Value } from '../evaluator-utils';

export type BuiltinDependencies = {
	fs: typeof NodeFs;
	programArgs: string[];
	applyTraitFunctionWithValues: (
		traitFunction: TraitFunctionValue,
		values: Value[]
	) => Value;
	resolveTraitFunctionWithArgs: (
		functionName: string,
		values: Value[],
		traitRegistry: TraitRegistry
	) => Value;
};
