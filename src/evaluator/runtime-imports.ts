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

type RuntimeFileSystem = {
	readFileSync(path: string, encoding: 'utf8'): string;
};

export type ImportRuntimeContext = {
	fs: RuntimeFileSystem;
	path: typeof defaultPath;
	usesCustomFileSystem: boolean;
	currentFileDir?: string;
	createChildEvaluator: () => ChildEvaluator;
	loadModule: (
		specifier: string,
		currentFileDir?: string
	) => RuntimeModuleCache;
	mergeMetadata: (cache: RuntimeModuleCache) => void;
};

type ImportMetadataTarget = {
	traitRegistry: TraitRegistry;
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

function registerImportedConstructors(
	adtDiff: RuntimeModuleCache['adtDiff'],
	register: ImportMetadataTarget['registerConstructorVariant']
): void {
	for (const [typeName, adtEntry] of adtDiff) {
		for (const constructorName of adtEntry.constructors.keys()) {
			register(constructorName, typeName);
		}
	}
}

function implementationsFor(
	traitName: string,
	registry: TraitRegistry
): Map<string, TraitImplementation> {
	const existing = registry.implementations.get(traitName);
	if (existing) return existing;

	const created = new Map<string, TraitImplementation>();
	registry.implementations.set(traitName, created);
	return created;
}

function mergeCapturedMembers(
	existing: TraitImplementation,
	imported: TraitImplementation
): void {
	if (!existing.evaluatedFunctions && imported.evaluatedFunctions) {
		existing.evaluatedFunctions = imported.evaluatedFunctions;
	}
	if (!existing.evaluatedValues && imported.evaluatedValues) {
		existing.evaluatedValues = imported.evaluatedValues;
	}
}

function mergeTraitImplementations(
	traitImplDiff: RuntimeModuleCache['traitImplDiff'],
	registry: TraitRegistry
): void {
	for (const [traitName, byType] of traitImplDiff) {
		const implementations = implementationsFor(traitName, registry);
		for (const [typeName, imported] of byType) {
			const existing = implementations.get(typeName);
			if (existing) {
				mergeCapturedMembers(existing, imported);
			} else {
				implementations.set(typeName, imported);
			}
		}
	}
}

function addTraitIndexEntry(
	index: Map<string, string[]>,
	memberName: string,
	traitName: string
): void {
	const existing = index.get(memberName) ?? [];
	if (!existing.includes(traitName)) {
		index.set(memberName, [...existing, traitName]);
	}
}

function mergeTraitDefinitions(
	traitDefDiff: RuntimeModuleCache['traitDefDiff'],
	registry: TraitRegistry
): void {
	const valueTraits =
		registry.valueTraits ?? (registry.valueTraits = new Map());
	for (const [traitName, definition] of traitDefDiff) {
		if (registry.definitions.has(traitName)) continue;

		registry.definitions.set(traitName, definition);
		for (const functionName of definition.functions.keys()) {
			addTraitIndexEntry(registry.functionTraits, functionName, traitName);
		}
		for (const valueName of definition.values?.keys() ?? []) {
			addTraitIndexEntry(valueTraits, valueName, traitName);
		}
		implementationsFor(traitName, registry);
	}
}

export function mergeImportedMetadata(
	cache: RuntimeModuleCache,
	target: ImportMetadataTarget
): void {
	registerImportedConstructors(
		cache.adtDiff,
		target.registerConstructorVariant
	);
	mergeTraitImplementations(cache.traitImplDiff, target.traitRegistry);
	mergeTraitDefinitions(cache.traitDefDiff, target.traitRegistry);
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
		context.mergeMetadata(cache);
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
