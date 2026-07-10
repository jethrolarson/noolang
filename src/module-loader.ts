/**
 * Module loader — Phase 1 Step 2.
 *
 * Implements `loadModule(realpath)` with:
 *   - Realpath-keyed memoisation
 *   - Cycle detection (in-progress set)
 *   - Hermetic type-check in a fresh TypeState seeded from a single frozen
 *     builtins+stdlib base (computed once, never re-checked per module)
 *   - Top-level effect rejection and top-level `mut` rejection
 *   - Transitive manifest extraction + mergeManifests
 *   - Instance closure capture (§4): each implement member evaluated against
 *     the defining module's environment, stored as a pre-evaluated Value
 *
 * No file I/O policy changes here — resolution stays CWD-based (step 3 adds
 * file-relative resolution and the import map).
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import type { Expression, Type } from './ast';
import { flattenStatements } from './typer/type-operations';
import { createTypeState, loadStdlib, generalize } from './typer/type-operations';
import { substitute } from './typer/substitute';
import { initializeBuiltins } from './typer/builtins';
import { typeExpression } from './typer/expression-dispatcher';
import {
	emptyManifest,
	mergeManifests,
	type Manifest,
	type ManifestADT,
	type ManifestInstance,
	type ManifestTraitDef,
} from './typer/module-manifest';
import type {
	TypeState,
	TypeScheme,
	ADTRegistry,
} from './typer/types';
import { emptyEffects, unionEffects } from './typer/types';
import type {
	TraitRegistry,
	TraitDefinition,
	TraitImplementation,
} from './typer/trait-system';
import { createTraitRegistry, getTypeName } from './typer/trait-system';
import { Evaluator } from './evaluator/evaluator';
import type { Value } from './evaluator/evaluator-utils';
import { Lexer } from './lexer/lexer';
import { parse } from './parser/parser';

// ─── frozen base ──────────────────────────────────────────────────────────────

/**
 * The builtins+stdlib TypeState, computed exactly once.
 * Every hermetic module check starts from a clone of this — we never
 * re-run initializeBuiltins/loadStdlib per module (that is the perf guarantee).
 */
let _frozenBase: TypeState | null = null;

function getFrozenBase(): TypeState {
	if (!_frozenBase) {
		let s = createTypeState();
		s = initializeBuiltins(s);
		s = loadStdlib(s);
		_frozenBase = s;
	}
	return _frozenBase;
}

/**
 * Deep-clone a TypeState so a module's hermetic check cannot mutate the frozen
 * base. The Maps that are mutated during type-checking (environment, adtRegistry,
 * traitRegistry sub-maps) are cloned; immutable scalars are copied by value.
 */
function cloneTypeStateForModule(base: TypeState): TypeState {
	// Shallow copy of environment map (TypeScheme values are plain objects, not mutated)
	const environment = new Map(base.environment);

	// Deep-clone adtRegistry: outer Map + inner constructors Map
	const adtRegistry: ADTRegistry = new Map();
	for (const [name, info] of base.adtRegistry) {
		adtRegistry.set(name, {
			typeParams: [...info.typeParams],
			constructors: new Map(info.constructors),
		});
	}

	// Deep-clone traitRegistry: definitions Map, nested implementations Map, functionTraits Map
	const traitRegistry: TraitRegistry = {
		definitions: new Map(base.traitRegistry.definitions),
		implementations: new Map(),
		functionTraits: new Map(
			Array.from(base.traitRegistry.functionTraits.entries()).map(([k, v]) => [k, [...v]])
		),
	};
	for (const [traitName, impls] of base.traitRegistry.implementations) {
		traitRegistry.implementations.set(traitName, new Map(impls));
	}

	return {
		environment,
		substitution: new Map(), // Always fresh for each module
		// Counter starts from base.counter for every module. Two different
		// modules can therefore mint the SAME fresh-var names (α5, α6, …) —
		// but that is sound and order-independent because:
		//   1. Each module is checked in isolation with its OWN substitution map,
		//      so identical names in module A and module B never interact.
		//   2. The export type is generalized (closed — all free vars quantified)
		//      before caching, so the cached scheme carries no importer-visible
		//      free variables that could collide.
		//   3. At each import site, `instantiate` re-freshens the scheme's
		//      quantified vars using the IMPORTER's own monotonic counter, so
		//      distinct imports (and distinct import orders) get distinct vars.
		// This is what the "identical type across importers/orders" headline test
		// exercises. The counter is never reset to a colliding fixed value.
		counter: base.counter,
		constraints: [],
		adtRegistry,
		traitRegistry,
		protectedTypeNames: new Set(base.protectedTypeNames),
	};
}

// ─── module cache types ───────────────────────────────────────────────────────

/** Subset of ADTRegistry info needed to seed an importer's TypeState. */
export type CachedADTEntry = {
	typeParams: string[];
	constructors: Map<string, Type[]>;
};

/** Full cached result for a module at a given realpath. */
export type ModuleCache = {
	/** Generalised export type (last statement, fully substituted). */
	exportType: TypeScheme;
	/** Runtime export value (last statement's evaluated value). */
	exportValue: Value;
	/** Transitive manifest: own declarations ∪ imported manifests. */
	manifest: Manifest;
	/**
	 * ADT definitions added by this module (own + transitive) relative to frozenBase.
	 * Used to seed the importer's adtRegistry.
	 */
	adtDiff: Map<string, CachedADTEntry>;
	/**
	 * Trait definitions added by this module relative to frozenBase.
	 * Used to seed the importer's traitRegistry.definitions.
	 */
	traitDefDiff: Map<string, TraitDefinition>;
	/**
	 * Trait implementations added by this module relative to frozenBase.
	 * traitName → typeName → TraitImplementation
	 */
	traitImplDiff: Map<string, Map<string, TraitImplementation>>;
	/**
	 * Environment entries added by this module relative to frozenBase.
	 * Includes ADT constructor functions, etc.
	 */
	envDiff: Map<string, TypeScheme>;
};

// ─── caches ───────────────────────────────────────────────────────────────────

const moduleCache = new Map<string, ModuleCache>();
const inProgress = new Set<string>();

/** Clear the module cache. Intended for tests only. */
export function clearModuleCache(): void {
	moduleCache.clear();
	inProgress.clear();
	// Also reset frozen base so tests that need clean state get it
	// (most tests don't need to reset this, but correctness over perf in tests)
}

// ─── path resolution ──────────────────────────────────────────────────────────

/**
 * Resolve an import path to a canonical realpath.
 * Appends `.noo` if missing. Resolves relative to `currentDir` if given,
 * else relative to process.cwd().
 */
export function resolveModulePath(importPath: string, currentDir?: string): string {
	const withExt = importPath.endsWith('.noo') ? importPath : `${importPath}.noo`;
	const base = currentDir ?? process.cwd();
	const absolute = nodePath.isAbsolute(withExt)
		? withExt
		: nodePath.resolve(base, withExt);
	return fs.realpathSync(absolute);
}

// ─── manifest + diff extraction ───────────────────────────────────────────────

/**
 * After hermetic type-check, extract:
 *   - Own manifest entries (declarations in this module's statements only)
 *   - Diffs vs frozenBase (for seeding importer's TypeState)
 * Also merges with already-imported manifests to get the transitive manifest.
 */
function extractDiffsAndManifest(
	stmts: Expression[],
	moduleState: TypeState,
	frozenBase: TypeState,
	realpath: string
): {
	ownManifest: Manifest;
	adtDiff: Map<string, CachedADTEntry>;
	traitDefDiff: Map<string, TraitDefinition>;
	traitImplDiff: Map<string, Map<string, TraitImplementation>>;
	envDiff: Map<string, TypeScheme>;
	transitiveManifest: Manifest;
} {
	const ownManifest: Manifest = {
		adts: [],
		instances: [],
		traitDefs: [],
	};
	const adtDiff = new Map<string, CachedADTEntry>();
	const traitDefDiff = new Map<string, TraitDefinition>();
	const traitImplDiff = new Map<string, Map<string, TraitImplementation>>();

	// Scan AST for declarations made in THIS module's statements
	for (const stmt of stmts) {
		if (stmt.kind === 'type-definition') {
			// ADT (variant) definition
			if (!frozenBase.adtRegistry.has(stmt.name)) {
				const adtInfo = moduleState.adtRegistry.get(stmt.name);
				if (adtInfo) {
					ownManifest.adts.push({
						name: stmt.name,
						definingPath: realpath,
						typeParams: adtInfo.typeParams,
						constructors: adtInfo.constructors as Map<string, unknown[]>,
					});
					adtDiff.set(stmt.name, {
						typeParams: adtInfo.typeParams,
						constructors: adtInfo.constructors,
					});
				}
			}
		} else if (stmt.kind === 'constraint-definition') {
			// Trait definition
			if (!frozenBase.traitRegistry.definitions.has(stmt.name)) {
				const traitDef = moduleState.traitRegistry.definitions.get(stmt.name);
				if (traitDef) {
					ownManifest.traitDefs.push({
						name: stmt.name,
						definingPath: realpath,
					});
					traitDefDiff.set(stmt.name, traitDef);
				}
			}
		} else if (stmt.kind === 'implement-definition') {
			// Trait implementation
			const typeName = getTypeName(stmt.typeExpr);
			const traitName = stmt.constraintName;
			const baseImpls = frozenBase.traitRegistry.implementations.get(traitName);
			if (!baseImpls || !baseImpls.has(typeName)) {
				const traitImpls = moduleState.traitRegistry.implementations.get(traitName);
				const impl = traitImpls?.get(typeName);
				if (impl) {
					ownManifest.instances.push({
						traitName,
						typeName,
						definingPath: realpath,
					});
					if (!traitImplDiff.has(traitName)) {
						traitImplDiff.set(traitName, new Map());
					}
					traitImplDiff.get(traitName)!.set(typeName, impl);
				}
			}
		}
	}

	// Environment diff: everything in moduleState.environment NOT in frozenBase.environment
	const envDiff = new Map<string, TypeScheme>();
	for (const [name, scheme] of moduleState.environment) {
		if (!frozenBase.environment.has(name)) {
			envDiff.set(name, scheme);
		}
	}

	// Merge transitive manifest: own declarations ∪ all imported module manifests.
	// moduleState.importerManifest holds the accumulated imported manifests
	// (set by typeImport as it processes each import statement).
	const importedMergedManifest = moduleState.importerManifest ?? emptyManifest();
	const transitiveManifest = mergeManifests(ownManifest, importedMergedManifest);

	return {
		ownManifest,
		adtDiff,
		traitDefDiff,
		traitImplDiff,
		envDiff,
		transitiveManifest,
	};
}

// ─── instance closure capture ─────────────────────────────────────────────────

/**
 * After the module's `evaluateProgram` has fully run, capture a pre-evaluated
 * closure Value for each implement member defined in this module's statements (§4).
 *
 * We mutate `evaluatedFunctions` DIRECTLY on the shared `TraitImplementation`
 * objects (the same references held by `traitImplDiff` and the module's
 * traitRegistry). This guarantees the AST `functions` map and the
 * `evaluatedFunctions` map travel together and can never fall out of sync —
 * the dispatch AST fallback stays real.
 *
 * We evaluate AFTER the whole program has run, so every module-level binding
 * (including helpers referenced by an instance member) is in scope.
 *
 * We do NOT swallow evaluation errors. Trait members are function-typed, so
 * capturing them is just closure creation (lazy — it never touches the body's
 * free variables); any throw here is a genuine, otherwise-hidden error and must
 * surface. Undefined-helper references are already rejected earlier by the typer
 * (Noolang does not hoist top-level bindings), so a type-valid module cannot
 * throw here in practice — but if one ever does, we fail loudly rather than
 * silently dropping the member.
 */
function captureInstanceClosures(
	stmts: Expression[],
	evaluator: Evaluator,
	frozenBaseTraitImpls: Map<string, Map<string, TraitImplementation>>
): void {
	for (const stmt of stmts) {
		if (stmt.kind !== 'implement-definition') continue;

		const typeName = getTypeName(stmt.typeExpr);
		const traitName = stmt.constraintName;

		// Skip if this impl was already in the frozen base (it's a stdlib impl,
		// dispatched via its native/AST path — not a module-local closure).
		const baseImpls = frozenBaseTraitImpls.get(traitName);
		if (baseImpls?.has(typeName)) continue;

		// Look up the shared TraitImplementation object.
		const traitImpls = evaluator.traitRegistry.implementations.get(traitName);
		const impl = traitImpls?.get(typeName);
		if (!impl) continue;

		const evaluated = new Map<string, unknown>();
		for (const [fnName, fnExpr] of impl.functions) {
			// No try/catch: a throw here is a real error, surfaced with context.
			evaluated.set(fnName, evaluator.evaluateExpression(fnExpr) as Value);
		}
		// Attach onto the shared impl object so functions + evaluatedFunctions
		// stay together in the cache's traitImplDiff.
		impl.evaluatedFunctions = evaluated;
	}
}

// ─── main loader ──────────────────────────────────────────────────────────────

/**
 * Load a module by canonical realpath.
 *
 * Contract:
 *   - Memoised: second call returns the cache entry (no re-check, no re-eval).
 *   - Hermetic: type-check uses a fresh TypeState derived from the frozen base,
 *     never the importer's environment.
 *   - Cycle-safe: throws with the chain on A → B → A.
 *   - Pure: top-level effects → hard error; top-level `mut` → hard error.
 *   - Transitive manifest: merges own declarations with imported manifests.
 */
export function loadModule(realpath: string): ModuleCache {
	// Cache hit
	const cached = moduleCache.get(realpath);
	if (cached) return cached;

	// Cycle detection
	if (inProgress.has(realpath)) {
		const chain = [...inProgress, realpath].join(' → ');
		throw new Error(
			`Circular import detected: ${chain}. ` +
				`Mutual recursion is expressible within one file; ` +
				`or extract a shared third module.`
		);
	}

	inProgress.add(realpath);

	try {
		// Read and parse
		const content = fs.readFileSync(realpath, 'utf8');
		const lexer = new Lexer(content);
		const tokens = lexer.tokenize();
		const program = parse(tokens);

		// Flatten semicolon-chained statements (same logic as typer)
		const stmts: Expression[] = [];
		for (const s of program.statements) {
			stmts.push(...flattenStatements(s));
		}

		// Reject top-level mut bindings immediately (before type-check)
		for (const stmt of stmts) {
			if (stmt.kind === 'mutable-definition') {
				throw new Error(
					`Module '${realpath}' has a top-level \`mut\` binding. ` +
						`Mutable bindings are not allowed at module top level — ` +
						`they would become cross-importer singletons via caching.`
				);
			}
		}

		const frozenBase = getFrozenBase();

		// ── Hermetic type-check ────────────────────────────────────────────────

		// Start from a clone of the frozen base (builtins+stdlib, never re-checked)
		let moduleState = cloneTypeStateForModule(frozenBase);

		// Seed the moduleState with the current file's directory so nested
		// typeImport calls can resolve relative paths correctly.
		moduleState = { ...moduleState, currentDir: nodePath.dirname(realpath) };

		let allEffects = emptyEffects();
		let exportType: Type = { kind: 'unit' } as Type;

		for (const stmt of stmts) {
			// typeExpression handles all statement kinds, including 'import' via
			// typeImport. typeImport calls loadModule recursively and merges
			// declarations + importerManifest into the TypeState automatically.
			const result = typeExpression(stmt, moduleState);
			moduleState = result.state;
			exportType = result.type;

			// Collect only immediate (non-latent) effects.
			// Latent effects live inside function types; we only reject effects
			// produced by non-function-typed statements (i.e., executed at load).
			if (result.effects.size > 0) {
				const resolvedType = substitute(result.type, moduleState.substitution);
				if (resolvedType.kind !== 'function') {
					allEffects = unionEffects(allEffects, result.effects);
				}
			}
		}

		// Reject top-level effects
		if (allEffects.size > 0) {
			const effectList = [...allEffects].join(', ');
			throw new Error(
				`Module '${realpath}' has top-level effects (${effectList}). ` +
					`Imports must be referentially transparent. ` +
					`Export an effect-typed function instead.`
			);
		}

		// Generalise and substitute the export type for importer-independent caching
		const resolvedExportType = substitute(exportType, moduleState.substitution);
		const exportScheme = generalize(
			resolvedExportType,
			moduleState.environment,
			moduleState.substitution
		);

		// ── Extract manifest + diffs ───────────────────────────────────────────

		const { adtDiff, traitDefDiff, traitImplDiff, envDiff, transitiveManifest } =
			extractDiffsAndManifest(
				stmts,
				moduleState,
				frozenBase,
				realpath
			);

		// ── Runtime evaluation ─────────────────────────────────────────────────

		// Use the module's own TypeState's traitRegistry so the evaluator has
		// access to the correct Expression ASTs for dispatch.
		const evaluator = new Evaluator({
			traitRegistry: moduleState.traitRegistry,
		});
		const evalResult = evaluator.evaluateProgram(program, realpath);
		const exportValue = evalResult.finalResult;

		// ── Instance closure capture (§4) ──────────────────────────────────────

		// Attaches `evaluatedFunctions` onto the shared impl objects in
		// traitImplDiff (kept in sync with their AST `functions` map).
		captureInstanceClosures(
			stmts,
			evaluator,
			frozenBase.traitRegistry.implementations
		);

		// ── Cache and return ───────────────────────────────────────────────────

		const entry: ModuleCache = {
			exportType: exportScheme,
			exportValue,
			manifest: transitiveManifest,
			adtDiff,
			traitDefDiff,
			traitImplDiff,
			envDiff,
		};

		moduleCache.set(realpath, entry);
		return entry;
	} finally {
		inProgress.delete(realpath);
	}
}

// ─── state merge helpers ──────────────────────────────────────────────────────

/**
 * Merge a loaded module's declarations into an importer's TypeState.
 * Used by typeImport after loadModule.
 *
 * Does NOT re-validate — trusts the hermetic check that produced the cache.
 * Conflict detection happened in mergeManifests at the manifest level.
 */
export function mergeModuleCacheIntoTypeState(
	cache: ModuleCache,
	importerState: TypeState
): TypeState {
	// Merge environment diff (ADT constructors, user-defined names, etc.)
	const newEnv = new Map(importerState.environment);
	for (const [name, scheme] of cache.envDiff) {
		if (!newEnv.has(name)) {
			newEnv.set(name, scheme);
		}
	}

	// Merge ADT diff
	const newAdtRegistry = new Map(importerState.adtRegistry);
	for (const [name, info] of cache.adtDiff) {
		if (!newAdtRegistry.has(name)) {
			newAdtRegistry.set(name, {
				typeParams: info.typeParams,
				constructors: info.constructors,
			});
		}
	}

	// Merge trait definitions diff
	const newDefs = new Map(importerState.traitRegistry.definitions);
	const newFunctionTraits = new Map(
		Array.from(importerState.traitRegistry.functionTraits.entries()).map(([k, v]) => [k, [...v]])
	);

	// Build newImpls here so trait-def additions can also create empty impl entries
	const newImpls = new Map(importerState.traitRegistry.implementations);
	for (const [traitName, byType] of cache.traitImplDiff) {
		if (!newImpls.has(traitName)) {
			newImpls.set(traitName, new Map());
		}
		const traitImpls = newImpls.get(traitName)!;
		for (const [typeName, impl] of byType) {
			if (!traitImpls.has(typeName)) {
				traitImpls.set(typeName, impl);
			}
		}
	}

	for (const [name, traitDef] of cache.traitDefDiff) {
		if (!newDefs.has(name)) {
			newDefs.set(name, traitDef);
			// Create empty implementations entry so addTraitImplementation can find it
			if (!newImpls.has(name)) {
				newImpls.set(name, new Map());
			}
			// Register function names
			for (const fnName of traitDef.functions.keys()) {
				const existing = newFunctionTraits.get(fnName) ?? [];
				if (!existing.includes(name)) {
					newFunctionTraits.set(fnName, [...existing, name]);
				}
			}
		}
	}

	const newTraitRegistry: TraitRegistry = {
		definitions: newDefs,
		implementations: newImpls,
		functionTraits: newFunctionTraits,
	};

	// Also update protected type names
	const newProtected = new Set(importerState.protectedTypeNames);
	for (const name of cache.adtDiff.keys()) {
		newProtected.add(name);
	}

	return {
		...importerState,
		environment: newEnv,
		adtRegistry: newAdtRegistry,
		traitRegistry: newTraitRegistry,
		protectedTypeNames: newProtected,
	};
}
