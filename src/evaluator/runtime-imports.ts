import type * as defaultFs from 'node:fs';
import type * as defaultPath from 'node:path';
import type { ImportExpression, Program } from '../ast';
import { createError } from '../errors';
import { Lexer } from '../lexer/lexer';
import { parse } from '../parser/parser';
import type {
	TraitDefinition,
	TraitImplementation,
	TraitRegistry,
} from '../typer/trait-system';
import type { Value } from './evaluator-utils';

export type RuntimeModuleCache = {
	exportValue: Value;
	adtDiff: ReadonlyMap<string, { constructors: ReadonlyMap<string, unknown> }>;
	traitDefDiff: ReadonlyMap<string, TraitDefinition>;
	traitImplDiff: ReadonlyMap<string, ReadonlyMap<string, TraitImplementation>>;
};

type ChildEvaluator = {
	evaluateProgram(program: Program, filePath?: string): { finalResult: Value };
};

export type ImportRuntimeContext = {
	fs: typeof defaultFs;
	path: typeof defaultPath;
	usesCustomFileSystem: boolean;
	currentFileDir?: string;
	traitRegistry: TraitRegistry;
	createChildEvaluator: () => ChildEvaluator;
	loadModule: (
		specifier: string,
		currentFileDir?: string
	) => RuntimeModuleCache;
	registerConstructorVariant: (
		constructorName: string,
		typeName: string
	) => void;
};

function evaluateDirectImport(
	expr: ImportExpression,
	context: ImportRuntimeContext
): Value {
	const filePath = expr.path.endsWith('.noo') ? expr.path : `${expr.path}.noo`;
	let fullPath: string;
	if (context.path.isAbsolute(filePath)) {
		fullPath = filePath;
	} else if (context.currentFileDir) {
		fullPath = context.path.resolve(context.currentFileDir, filePath);
	} else {
		fullPath = context.path.resolve(filePath);
	}

	const content = context.fs.readFileSync(fullPath, 'utf8');
	const program = parse(new Lexer(content).tokenize());
	return context.createChildEvaluator().evaluateProgram(program, fullPath)
		.finalResult;
}

function mergeRuntimeMetadata(
	cache: RuntimeModuleCache,
	context: ImportRuntimeContext
): void {
	for (const [typeName, adtEntry] of cache.adtDiff) {
		for (const constructorName of adtEntry.constructors.keys()) {
			context.registerConstructorVariant(constructorName, typeName);
		}
	}

	for (const [traitName, byType] of cache.traitImplDiff) {
		if (!context.traitRegistry.implementations.has(traitName)) {
			context.traitRegistry.implementations.set(traitName, new Map());
		}
		const traitImplementations =
			context.traitRegistry.implementations.get(traitName)!;
		for (const [typeName, implementation] of byType) {
			if (!traitImplementations.has(typeName)) {
				traitImplementations.set(typeName, implementation);
			} else {
				const existing = traitImplementations.get(typeName)!;
				if (!existing.evaluatedFunctions && implementation.evaluatedFunctions) {
					existing.evaluatedFunctions = implementation.evaluatedFunctions;
				}
				if (!existing.evaluatedValues && implementation.evaluatedValues) {
					existing.evaluatedValues = implementation.evaluatedValues;
				}
			}
		}
	}

	const valueTraits =
		context.traitRegistry.valueTraits ??
		(context.traitRegistry.valueTraits = new Map());
	for (const [traitName, traitDefinition] of cache.traitDefDiff) {
		if (!context.traitRegistry.definitions.has(traitName)) {
			context.traitRegistry.definitions.set(traitName, traitDefinition);
			for (const functionName of traitDefinition.functions.keys()) {
				const existing =
					context.traitRegistry.functionTraits.get(functionName) ?? [];
				if (!existing.includes(traitName)) {
					context.traitRegistry.functionTraits.set(functionName, [
						...existing,
						traitName,
					]);
				}
			}
			for (const valueName of traitDefinition.values?.keys() ?? []) {
				const existing = valueTraits.get(valueName) ?? [];
				if (!existing.includes(traitName)) {
					valueTraits.set(valueName, [...existing, traitName]);
				}
			}
			if (!context.traitRegistry.implementations.has(traitName)) {
				context.traitRegistry.implementations.set(traitName, new Map());
			}
		}
	}
}

function formatImportFailure(error: unknown): string {
	if (error instanceof Error) {
		return error.stack
			? `${error.message}\nStack trace:\n${error.stack}`
			: error.message;
	}
	if (typeof error === 'object') {
		try {
			return JSON.stringify(error, null, 2);
		} catch (_error) {
			return String(error);
		}
	}
	return String(error);
}

export function evaluateRuntimeImport(
	expr: ImportExpression,
	context: ImportRuntimeContext
): Value {
	if (context.usesCustomFileSystem) {
		return evaluateDirectImport(expr, context);
	}

	try {
		const cache = context.loadModule(expr.path, context.currentFileDir);
		mergeRuntimeMetadata(cache, context);
		return cache.exportValue;
	} catch (error) {
		const filePath = expr.path.endsWith('.noo')
			? expr.path
			: `${expr.path}.noo`;
		const fullPath = context.currentFileDir
			? context.path.resolve(context.currentFileDir, filePath)
			: context.path.resolve(filePath);

		throw createError(
			'ImportError',
			`Failed to import '${
				expr.path
			}': ${formatImportFailure(error)}\n  Tried to resolve: ${fullPath}\n  Current working directory: ${process.cwd()}\n  Importing file directory: ${
				context.currentFileDir || 'unknown'
			}\n  Suggestion: Use a path relative to the importing file, e.g., 'math_functions' or '../std/math'`,
			{
				line: expr.location.start.line,
				column: expr.location.start.column,
				start: expr.location.start.line,
				end: expr.location.end.line,
			},
			`import "${expr.path}"`,
			'Check that the file exists and can be parsed, and that the path is correct relative to the importing file.'
		);
	}
}
