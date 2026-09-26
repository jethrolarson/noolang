import * as defaultFs from 'node:fs';
import * as defaultPath from 'node:path';
import type {
	Expression,
	Program,
	LiteralExpression,
	VariableExpression,
	FunctionExpression,
	ApplicationExpression,
	PipelineExpression,
	BinaryExpression,
	IfExpression,
	DefinitionExpression,
	TupleDestructuringExpression,
	RecordDestructuringExpression,
	TupleDestructuringPattern,
	RecordDestructuringPattern,
	ImportExpression,
	RecordExpression,
	AccessorExpression,
	TypeDefinitionExpression,
	UserDefinedTypeExpression,
	MatchExpression,
	WhereExpression,
	MutableDefinitionExpression,
	MutationExpression,
	DestructuringElement,
	RecordDestructuringField,
	Type,
} from '../ast';
import type { TraitRegistry } from '../typer/trait-system';
// Aliased: an existing local `flattenStatements` (below) fully recurses
// through parens for stdlib loading; this one stops at a parenthesized `;`
// boundary, matching the typer's own top-level-vs-nested-sequence
// distinction (type-inference.ts's typeBinary uses the same function).
import { flattenStatements as flattenTopLevelStatements } from '../typer/type-operations';
import {
	Value,
	isFunction,
	isNativeFunction,
	isTraitFunctionValue,
	createNativeFunction,
	createFunction,
	createNumber,
	createString,
	createBool,
	boolValue,
	createUnit,
	createTuple,
	createConstructor,
	createList,
	createRecord,
	isNumber,
	isString,
	isBool,
	isUnit,
	isAnyFunction,
	isList,
	isRecord,
	isConstructor,
	isTuple,
	isCell,
	createCell,
	valueToString,
	compareStructuralValues,
	type TupleValue,
	RecordValue,
	type Environment,
} from './evaluator-utils';
import { createBuiltinEnvironment } from './builtins';
import { matchPattern } from './pattern-matching';
import { containsVariable } from './recursion-analysis';
import { expressionToString } from './trace-format';

// Retained compatibility surface: repository code imports evaluator-utils directly,
// but downstream consumers cannot be exhaustively audited without an owner decision.
export {
	type Value,
	type Environment,
	isFunction,
	isNativeFunction,
	isTraitFunctionValue,
	isNumber,
	isString,
	isBool,
	isList,
	isRecord,
	isTuple,
	isUnit,
	isConstructor,
	isAnyFunction,
	boolValue,
	createFunction,
	createNativeFunction,
	createNumber,
};

import { createError } from '../errors';
import { Lexer } from '../lexer/lexer';
import { parse } from '../parser/parser';

export type ExecutionStep = {
	expression: string;
	result: Value;
	// Only populated by evaluateProgramForAssertions (the typer decorates each
	// flattened `;`-leaf with its own resolved Type before evaluation runs;
	// evaluateProgram's coarser per-statement trace never sets this).
	type?: Type;
	location?: { line: number; column: number };
};

export type ProgramResult = {
	finalResult: Value;
	executionTrace: ExecutionStep[];
	environment: Map<string, Value>;
};

// Helper to flatten semicolon-separated binary expressions into individual statements
const flattenStatements = (expr: Expression): Expression[] => {
	if (expr.kind === 'binary' && expr.operator === ';') {
		return [...flattenStatements(expr.left), ...flattenStatements(expr.right)];
	}
	return [expr];
};

// A saturated tail call into a same-owner terminal closure (FunctionValue
// .tailInfo) produces this instead of invoking `.fn` — see ADR 8. Never
// leaks past evaluateTailPosition/runTrampolined.
type TailCall = {
	tailcall: true;
	param: string;
	body: Expression;
	env: Environment;
	arg: Value;
};

function isTailCall(value: Value | TailCall): value is TailCall {
	return (value as TailCall)?.tailcall === true;
}

export class Evaluator {
	public environment: Environment;
	private environmentStack: Environment[]; // Stack for efficient scoping
	private currentFileDir?: string; // Track the directory of the current file being evaluated
	private fs: typeof defaultFs;
	private path: typeof defaultPath;
	// Constructor name -> variant type name, so trait dispatch resolves
	// `show (Bar "hi")` against the impl for `Foo`, not a phantom `Bar` type
	private constructorVariants: Map<string, string> = new Map();
	public traitRegistry: TraitRegistry;

	constructor(opts: {
		fs?: typeof defaultFs;
		path?: typeof defaultPath;
		traitRegistry: TraitRegistry;
		skipStdlib?: boolean;
		programArgs?: string[];
	}) {
		this.fs = opts.fs ?? defaultFs;
		this.path = opts.path ?? defaultPath;
		this.traitRegistry = opts.traitRegistry;
		this.environment = createBuiltinEnvironment({
			fs: this.fs,
			programArgs: opts.programArgs ?? [],
			applyTraitFunctionWithValues: (traitFunction, values) =>
				this.applyTraitFunctionWithValues(traitFunction, values),
			resolveTraitFunctionWithArgs: (functionName, values, traitRegistry) =>
				this.resolveTraitFunctionWithArgs(
					functionName,
					values,
					traitRegistry
				),
		});
		this.environmentStack = [];

		if (!opts?.skipStdlib) {
			this.loadStdlib();
		}
	}


	private loadStdlib(): void {
		// Try multiple possible paths for stdlib.noo.
		// Primary: __dirname-relative (src/evaluator/../../stdlib.noo = project root).
		// This is CWD-independent and is the authoritative path.
		// Fallbacks are kept for environments where __dirname behaves unexpectedly.
		const possiblePaths = [
			this.path.join(__dirname, '..', '..', 'stdlib.noo'),
			this.path.join(process.cwd(), 'stdlib.noo'),
			this.path.join(process.cwd(), 'src', '..', 'stdlib.noo'),
		];

		let stdlibPath: string | null = null;
		for (const path of possiblePaths) {
			if (this.fs.existsSync(path)) {
				stdlibPath = path;
				break;
			}
		}

		if (!stdlibPath) {
			const msg = `[Noolang ERROR] Could not find stdlib.noo in any of these paths:\n  ${possiblePaths.join(
				'\n  '
			)}`;
			console.error(msg);
			throw new Error(msg);
		}
		const stdlibContent = this.fs.readFileSync(stdlibPath, 'utf-8');
		const lexer = new Lexer(stdlibContent);
		const tokens = lexer.tokenize();
		const stdlibProgram = parse(tokens);
		const allStatements: Expression[] = [];
		for (const statement of stdlibProgram.statements) {
			allStatements.push(...flattenStatements(statement));
		}
		for (const statement of allStatements) {
			this.evaluateExpression(statement);
		}
	}

	evaluateProgram(program: Program, filePath?: string): ProgramResult {
		if (filePath) {
			this.currentFileDir = this.path.dirname(this.path.resolve(filePath));
		}

		const executionTrace: ExecutionStep[] = [];

		if (program.statements.length === 0) {
			return {
				finalResult: createList([]),
				executionTrace,
				environment: new Map(
					Array.from(this.environment.entries()).map(([k, v]) => [
						k,
						isCell(v) ? v.value : v,
					])
				),
			};
		}

		let finalResult: Value = createList([]);

		for (const statement of program.statements) {
			const result = this.evaluateExpression(statement);

			// Add to execution trace
			executionTrace.push({
				expression: expressionToString(statement),
				result: result,
				location: {
					line: statement.location.start.line,
					column: statement.location.start.column,
				},
			});

			finalResult = result;
		}

		return {
			finalResult,
			executionTrace,
			environment: new Map(
				Array.from(this.environment.entries()).map(([k, v]) => [
					k,
					isCell(v) ? v.value : v,
				])
			),
		};
	}

	// Literate `.md` files' `assert: true` frontmatter checks trailing `# =>`
	// comments against real per-line output. evaluateProgram's trace is one
	// ExecutionStep per program.statements entry, which collapses a whole
	// `;`-chain (e.g. one fenced code block with several `# =>` lines) into a
	// single entry holding only the chain's last value — too coarse to check
	// each annotated line. This method flattens each top-level statement's
	// un-parenthesized `;`-spine (via the same `flattenStatements` the typer
	// uses for the identical distinction) and traces one leaf at a time
	// instead, without changing evaluateProgram's own behavior or its
	// existing consumers (REPL, --verbose, general `.noo` execution).
	evaluateProgramForAssertions(program: Program, filePath?: string): ProgramResult {
		if (filePath) {
			this.currentFileDir = this.path.dirname(this.path.resolve(filePath));
		}

		const executionTrace: ExecutionStep[] = [];

		if (program.statements.length === 0) {
			return {
				finalResult: createList([]),
				executionTrace,
				environment: new Map(
					Array.from(this.environment.entries()).map(([k, v]) => [
						k,
						isCell(v) ? v.value : v,
					])
				),
			};
		}

		let finalResult: Value = createList([]);

		for (const statement of program.statements) {
			for (const leaf of flattenTopLevelStatements(statement)) {
				const result = this.evaluateExpression(leaf);

				executionTrace.push({
					expression: expressionToString(leaf),
					result: result,
					type: leaf.type,
					location: {
						line: leaf.location.start.line,
						column: leaf.location.start.column,
					},
				});

				finalResult = result;
			}
		}

		return {
			finalResult,
			executionTrace,
			environment: new Map(
				Array.from(this.environment.entries()).map(([k, v]) => [
					k,
					isCell(v) ? v.value : v,
				])
			),
		};
	}

	private evaluateDefinition(def: DefinitionExpression): Value {
		// Check if this definition might be recursive by looking for the name in the value
		const isRecursive = containsVariable(def.value, def.name);

		if (isRecursive) {
			// For recursive definitions, we need a placeholder that gets updated
			const cell = createCell(createUnit());
			this.environment.set(def.name, cell);
			const value = this.evaluateExpression(def.value);
			cell.value = value;
			return value;
		} else {
			// For non-recursive definitions, store the value directly
			const value = this.evaluateExpression(def.value);
			this.environment.set(def.name, value);
			return value;
		}
	}

	private evaluateTupleDestructuring(
		expr: TupleDestructuringExpression
	): Value {
		// Evaluate the right-hand side (tuple value)
		const value = this.evaluateExpression(expr.value);

		// Extract the tuple elements
		if (value.tag !== 'tuple') {
			throw new Error('Expected tuple value for tuple destructuring');
		}

		// Check that the number of pattern elements matches tuple elements
		if (expr.pattern.elements.length !== value.values.length) {
			throw new Error(
				`Tuple destructuring length mismatch: pattern has ${expr.pattern.elements.length} elements but value has ${value.values.length}`
			);
		}

		// Bind each pattern element to its corresponding value
		for (let i = 0; i < expr.pattern.elements.length; i++) {
			const element = expr.pattern.elements[i];
			const elementValue = value.values[i];

			if (element.kind === 'variable') {
				this.environment.set(element.name, elementValue);
			} else if (element.kind === 'nested-tuple') {
				// Handle nested tuple destructuring
				if (elementValue.tag !== 'tuple') {
					throw new Error(
						`Expected tuple value for nested tuple destructuring at position ${i}, got ${elementValue.tag}`
					);
				}

				this.extractTupleElements(element.pattern, elementValue);
			} else if (element.kind === 'nested-record') {
				// Handle nested record destructuring
				if (elementValue.tag !== 'record') {
					throw new Error(
						`Expected record value for nested record destructuring at position ${i}, got ${elementValue.tag}`
					);
				}

				this.extractRecordFields(element.pattern, elementValue);
			} else {
				throw new Error(
					`Unknown destructuring element kind: ${(element as DestructuringElement).kind}`
				);
			}
		}

		return value;
	}

	private extractTupleElements(
		pattern: TupleDestructuringPattern,
		tupleValue: TupleValue
	): void {
		// Check that the number of pattern elements matches tuple elements
		if (pattern.elements.length !== tupleValue.values.length) {
			throw new Error(
				`Nested tuple destructuring length mismatch: pattern has ${pattern.elements.length} elements but value has ${tupleValue.values.length}`
			);
		}

		// Bind each pattern element to its corresponding value
		for (let i = 0; i < pattern.elements.length; i++) {
			const element = pattern.elements[i];
			const elementValue = tupleValue.values[i];

			if (element.kind === 'variable') {
				this.environment.set(element.name, elementValue);
			} else if (element.kind === 'nested-tuple') {
				if (elementValue.tag !== 'tuple') {
					throw new Error(
						`Expected tuple value for nested tuple destructuring at position ${i}, got ${elementValue.tag}`
					);
				}
				this.extractTupleElements(element.pattern, elementValue);
			} else if (element.kind === 'nested-record') {
				if (elementValue.tag !== 'record') {
					throw new Error(
						`Expected record value for nested record destructuring at position ${i}, got ${elementValue.tag}`
					);
				}
				this.extractRecordFields(element.pattern, elementValue);
			} else {
				throw new Error(
					`Unknown destructuring element kind: ${(element as DestructuringElement).kind}`
				);
			}
		}
	}

	private extractRecordFields(
		pattern: RecordDestructuringPattern,
		recordValue: RecordValue
	): void {
		// Bind each pattern field to its corresponding value
		for (const field of pattern.fields) {
			if (field.kind === 'shorthand') {
				// @name -> name
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				this.environment.set(
					field.fieldName,
					recordValue.fields[field.fieldName]
				);
			} else if (field.kind === 'rename') {
				// @name userName -> userName
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				this.environment.set(
					field.localName,
					recordValue.fields[field.fieldName]
				);
			} else if (field.kind === 'nested-tuple') {
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				const fieldValue = recordValue.fields[field.fieldName];
				if (fieldValue.tag !== 'tuple') {
					throw new Error(
						`Expected tuple value for nested tuple destructuring in field '${field.fieldName}', got ${fieldValue.tag}`
					);
				}
				this.extractTupleElements(field.pattern, fieldValue);
			} else if (field.kind === 'nested-record') {
				if (!(field.fieldName in recordValue.fields)) {
					throw new Error(`Field '${field.fieldName}' not found in record`);
				}
				const fieldValue = recordValue.fields[field.fieldName];
				if (fieldValue.tag !== 'record') {
					throw new Error(
						`Expected record value for nested record destructuring in field '${field.fieldName}', got ${fieldValue.tag}`
					);
				}
				this.extractRecordFields(field.pattern, fieldValue);
			} else {
				throw new Error(
					`Unknown record destructuring field kind: ${(field as RecordDestructuringField).kind}`
				);
			}
		}
	}

	private evaluateRecordDestructuring(
		expr: RecordDestructuringExpression
	): Value {
		// Evaluate the right-hand side (record value)
		const value = this.evaluateExpression(expr.value);

		// Extract the record fields
		if (value.tag !== 'record') {
			throw new Error('Expected record value for record destructuring');
		}

		// Use the helper method to extract fields
		this.extractRecordFields(expr.pattern, value);

		return value;
	}

	private evaluateMutableDefinition(expr: MutableDefinitionExpression): Value {
		// Evaluate the right-hand side
		const value = this.evaluateExpression(expr.value);
		// Store a cell in the environment
		this.environment.set(expr.name, createCell(value));
		return value;
	}

	private evaluateMutation(expr: MutationExpression): Value {
		// Look up the variable in the environment
		const cell = this.environment.get(expr.target);
		if (!isCell(cell)) {
			throw new Error(`Cannot mutate non-mutable variable: ${expr.target}`);
		}
		// Evaluate the new value
		const value = this.evaluateExpression(expr.value);
		// Update the cell's value
		cell.value = value;
		return value;
	}

	evaluateExpression(expr: Expression): Value {
		switch (expr.kind) {
			case 'literal':
				return this.evaluateLiteral(expr);

			case 'variable':
				return this.evaluateVariable(expr);

			case 'function':
				return this.evaluateFunction(expr);

			case 'application':
				return this.evaluateApplication(expr);

			case 'pipeline':
				return this.evaluatePipeline(expr);

			case 'binary':
				return this.evaluateBinary(expr);

			case 'if':
				return this.evaluateIf(expr);

			case 'definition':
				return this.evaluateDefinition(expr);

			case 'tuple-destructuring':
				return this.evaluateTupleDestructuring(expr);

			case 'record-destructuring':
				return this.evaluateRecordDestructuring(expr);

			case 'mutable-definition':
				return this.evaluateMutableDefinition(expr);

			case 'mutation':
				return this.evaluateMutation(expr);

			case 'import':
				return this.evaluateImport(expr);

			case 'record':
				return this.evaluateRecord(expr);

			case 'accessor':
				return this.evaluateAccessor(expr);

			case 'tuple': {
				// Evaluate all elements and return a tagged tuple value
				const elements = expr.elements.map(e => {
					let val = this.evaluateExpression(e);
					if (isCell(val)) val = val.value;
					return val;
				});
				return createTuple(elements);
			}
			case 'unit': {
				// Return unit value
				return createUnit();
			}
			case 'list': {
				// Evaluate all elements and return a tagged list value
				const elements = expr.elements.map(e => {
					let val = this.evaluateExpression(e);
					if (isCell(val)) val = val.value;
					return val;
				});
				return createList(elements);
			}
			case 'where': {
				return this.evaluateWhere(expr);
			}
			case 'typed':
				// Type annotations are erased at runtime; just evaluate the inner expression
				return this.evaluateExpression(expr.expression);
			case 'constrained':
				// Constraint annotations are erased at runtime; just evaluate the inner expression
				return this.evaluateExpression(expr.expression);
			case 'type-definition':
				return this.evaluateTypeDefinition(expr as TypeDefinitionExpression);
			case 'user-defined-type':
				return this.evaluateUserDefinedType(expr as UserDefinedTypeExpression);
			case 'match':
				return this.evaluateMatch(expr as MatchExpression);
			case 'constraint-definition':
				return createUnit();
			case 'implement-definition':
				// Registration into the traitRegistry happens in the typer
				// (typeImplementDefinition → addTraitImplementation), which shares
				// its registry with this evaluator. Instance-closure capture (§4)
				// is performed once, post-evaluation, by the module loader against
				// the fully-populated module environment — not eagerly here (which
				// would capture before later bindings exist). Within a single
				// non-module program, dispatch uses the AST `functions` fallback.
				return createUnit();
			default:
				throw new Error(
					`Unknown expression kind: ${(expr as Expression).kind}`
				);
		}
	}

	private evaluateLiteral(expr: LiteralExpression): Value {
		if (Array.isArray(expr.value)) {
			// If it's a list, evaluate each element
			return createList(
				expr.value.map(element => {
					if (element && typeof element === 'object' && 'kind' in element) {
						// It's an AST node, evaluate it
						return this.evaluateExpression(element as Expression);
					} else {
						// It's already a value
						return element;
					}
				})
			);
		}

		// Convert primitive values to tagged values
		if (typeof expr.value === 'number') {
			return createNumber(expr.value);
		} else if (typeof expr.value === 'string') {
			return createString(expr.value);
		} else if (expr.value === null) {
			// Handle unit literals (null in AST represents unit)
			return createUnit();
		}

		// Should not reach here anymore since we removed boolean literals
		throw new Error(`Unsupported literal value: ${expr.value}`);
	}

	private evaluateVariable(expr: VariableExpression): Value {
		const value = this.environment.get(expr.name);
		if (value === undefined) {
			// NEW: Check if this is a trait function before throwing error
			if (this.isTraitFunction(expr.name)) {
				// Return a special trait function value that will be resolved during application
				return {
					tag: 'trait-function',
					name: expr.name,
					traitRegistry: this.traitRegistry,
				};
			}

			const error = createError(
				'RuntimeError',
				`Undefined variable: ${expr.name}`,
				{
					line: expr.location.start.line,
					column: expr.location.start.column,
					start: expr.location.start.line,
					end: expr.location.end.line,
				},
				expr.name,
				`Define the variable before using it: ${expr.name} = value`
			);
			throw error;
		}
		// If it's a cell, return its value
		if (isCell(value)) {
			return value.value;
		}
		return value;
	}

	// Bounces through same-owner tail calls in a loop instead of recursing in
	// JS — one JS frame for the whole run, not one per bounce (ADR 8).
	private runTrampolined(initialBody: Expression, initialEnv: Environment): Value {
		let currentBody = initialBody;
		let currentEnv = initialEnv;
		for (;;) {
			this.environment = currentEnv;
			const r = this.evaluateTailPosition(currentBody);
			if (!isTailCall(r)) return r;
			const nextEnv = new Map(r.env);
			nextEnv.set(r.param, r.arg);
			currentBody = r.body;
			currentEnv = nextEnv;
		}
	}

	// Tail-position counterpart to evaluateExpression: recurses through
	// tail-preserving node kinds (bounded by static nesting, not call count),
	// bounces at `application` (see runTrampolined), defers everything else.
	// Duplicates rather than shares logic with its non-tail counterparts —
	// a shared helper's extra JS frame overflowed a borderline test; see
	// ADR 8. Can drift if those methods change; nothing enforces sync.
	private evaluateTailPosition(expr: Expression): Value | TailCall {
		switch (expr.kind) {
			case 'if': {
				// Mirrors evaluateIf.
				const condition = this.evaluateExpression(expr.condition);
				let isTruthy = false;
				if (isBool(condition)) {
					isTruthy = boolValue(condition);
				} else if (isNumber(condition)) {
					isTruthy = condition.value !== 0;
				} else if (isString(condition)) {
					isTruthy = condition.value !== '';
				} else if (isUnit(condition)) {
					isTruthy = true;
				} else {
					isTruthy = true;
				}
				return this.evaluateTailPosition(isTruthy ? expr.then : expr.else);
			}
			case 'match': {
				// Mirrors evaluateMatch.
				const value = this.evaluateExpression(expr.expression);
				for (const matchCase of expr.cases) {
					const matchResult = matchPattern(matchCase.pattern, value);
					if (matchResult.matched) {
						return this.withNewEnvironment(() => {
							for (const [name, boundValue] of matchResult.bindings) {
								this.environment.set(name, boundValue);
							}
							return this.evaluateTailPosition(matchCase.expression);
						});
					}
				}
				throw new Error('No pattern matched in match expression');
			}
			case 'where': {
				// Mirrors evaluateWhere.
				return this.withNewEnvironment(() => {
					for (const def of expr.definitions) {
						if (def.kind === 'definition') {
							const value = this.evaluateExpression(def.value);
							this.environment.set(def.name, value);
						} else if (def.kind === 'mutable-definition') {
							const value = this.evaluateExpression(def.value);
							this.environment.set(def.name, createCell(value));
						} else if (def.kind === 'tuple-destructuring') {
							this.evaluateTupleDestructuring(def);
						} else if (def.kind === 'record-destructuring') {
							this.evaluateRecordDestructuring(def);
						}
					}
					return this.evaluateTailPosition(expr.main);
				});
			}
			case 'binary':
				if (expr.operator === ';') {
					this.evaluateExpression(expr.left);
					return this.evaluateTailPosition(expr.right);
				}
				// Other operators (+, ==, |, $, &&, ||, ...) out of scope — ADR 8.
				return this.evaluateExpression(expr);
			case 'pipeline':
				if (expr.steps.length === 1) {
					return this.evaluateTailPosition(expr.steps[0]);
				}
				return this.evaluateExpression(expr);
			case 'typed':
			case 'constrained':
				return this.evaluateTailPosition(expr.expression);
			case 'application': {
				// Only the single-arg shape bounces — evaluateApplication's
				// multi-arg loop breaks past the first arg if mirrored naively.
				if (expr.args.length !== 1) {
					return this.evaluateExpression(expr);
				}
				// Mirrors evaluateApplication, except: a saturated call into
				// a same-owner terminal closure bounces instead of `.fn`.
				const func = this.evaluateExpression(expr.func);
				if (func.tag === 'trait-function') {
					return this.evaluateTraitFunctionApplication(func, expr.args);
				}
				if (!isFunction(func) && !isNativeFunction(func)) {
					throw new Error(
						`Cannot apply non-function: ${typeof func} (${(func as Value)?.tag || 'unknown'})`
					);
				}
				let arg = this.evaluateExpression(expr.args[0]);
				if (isCell(arg)) arg = arg.value;
				if (isFunction(func) && func.tailInfo && func.tailInfo.owner === this) {
					return {
						tailcall: true,
						param: func.tailInfo.param,
						body: func.tailInfo.body,
						env: func.tailInfo.env,
						arg,
					};
				}
				return func.fn(arg);
			}
			default:
				return this.evaluateExpression(expr);
		}
	}

	private evaluateFunction(expr: FunctionExpression): Value {
		const self = this;
		// Create a closure that captures the current environment
		const closureEnv = new Map(this.environment);

		function createCurriedFunction(params: string[], body: Expression): Value {
			const isTerminal = params.length === 1;
			return createFunction((arg: Value) => {
				// Create a new environment for this function call
				const callEnv = new Map(closureEnv);

				// Set the parameter in the call environment
				const param = params[0];
				callEnv.set(param, arg);

				let result: Value;
				if (params.length === 1) {
					// The whole trampoline loop runs inside one withNewEnvironment.
					result = self.withNewEnvironment(() => {
						self.environment = callEnv;
						return self.runTrampolined(body, callEnv);
					});
				} else {
					// Create a function that captures the current parameter
					const remainingParams = params.slice(1);
					const nextIsTerminal = remainingParams.length === 1;

					const nextFunction = createFunction(
						(nextArg: Value) => {
							const nextCallEnv = new Map(callEnv);
							nextCallEnv.set(remainingParams[0], nextArg);

							if (remainingParams.length === 1) {
								return self.withNewEnvironment(() => {
									self.environment = nextCallEnv;
									return self.runTrampolined(body, nextCallEnv);
								});
							} else {
								// Continue currying for remaining parameters
								const remainingFunction = self.withNewEnvironment(() => {
									self.environment = nextCallEnv;
									return self.evaluateFunction({
										...expr,
										params: remainingParams,
									});
								});
								if (isFunction(remainingFunction)) {
									return remainingFunction.fn(nextArg);
								} else {
									throw new Error(
										`Expected function but got: ${typeof remainingFunction}`
									);
								}
							}
						},
						// tailInfo only on the terminal closure for this arity.
						nextIsTerminal
							? { param: remainingParams[0], body, env: callEnv, owner: self }
							: undefined
					);

					result = nextFunction;
				}

				return result;
			}, isTerminal ? { param: params[0], body, env: closureEnv, owner: self } : undefined);
		}

		return createCurriedFunction(expr.params, expr.body);
	}

	private evaluateApplication(expr: ApplicationExpression): Value {
		const func = this.evaluateExpression(expr.func);

		// NEW: Handle trait function application
		if (func.tag === 'trait-function') {
			return this.evaluateTraitFunctionApplication(func, expr.args);
		}

		// Only apply the function to the arguments present in the AST
		const args = expr.args;

		if (isFunction(func)) {
			// Handle tagged function application
			let result: any = func.fn;

			for (const argExpr of args) {
				let arg = this.evaluateExpression(argExpr);
				if (isCell(arg)) arg = arg.value;
				if (typeof result === 'function') {
					result = result(arg);
				} else {
					throw new Error(
						`Cannot apply argument to non-function: ${typeof result}`
					);
				}
			}

			return result;
		} else if (isNativeFunction(func)) {
			// Handle native function application
			let result: any = func.fn;

			for (const argExpr of args) {
				let arg = this.evaluateExpression(argExpr);
				if (isCell(arg)) arg = arg.value;
				if (typeof result === 'function') {
					result = result(arg);
				} else if (isFunction(result)) {
					result = result.fn(arg);
				} else if (isNativeFunction(result)) {
					result = result.fn(arg);
				} else {
					throw new Error(
						`Cannot apply argument to non-function: ${typeof result} (${result?.tag || 'unknown'})`
					);
				}
			}

			return result;
		} else {
			throw new Error(
				`Cannot apply non-function: ${typeof func} (${func?.tag || 'unknown'})`
			);
		}
	}

	private evaluatePipeline(expr: PipelineExpression): Value {
		// Pipeline should be function composition, not function application
		// For a pipeline like f |> g |> h, we want to compose them as h(g(f(x)))
		// For a pipeline like f <| g <| h, we want to compose them as f(g(h(x)))

		if (expr.steps.length === 1) {
			return this.evaluateExpression(expr.steps[0]);
		}

		// Determine composition direction based on operators
		const isLeftToRight = expr.operators.every(op => op === '|>');
		const isRightToLeft = expr.operators.every(op => op === '<|');

		if (!isLeftToRight && !isRightToLeft) {
			throw new Error(
				`Cannot mix pipeline operators |> and <| in the same expression`
			);
		}

		// For right-to-left composition (<|), reverse the steps
		const steps = isRightToLeft ? [...expr.steps].reverse() : expr.steps;

		// Start with the first function
		let composed = this.evaluateExpression(steps[0]);

		// Compose with each subsequent function
		for (let i = 1; i < steps.length; i++) {
			const nextFunc = this.evaluateExpression(steps[i]);

			if (isAnyFunction(composed) && isAnyFunction(nextFunc)) {
				// Capture the current composed function to avoid infinite recursion
				const currentComposed = composed;
				// Compose: nextFunc(composed(x))
				composed = createFunction((x: Value) => {
					// Apply currentComposed to x
					let intermediate: Value;
					if (
						isFunction(currentComposed) ||
						isNativeFunction(currentComposed)
					) {
						intermediate = currentComposed.fn(x);
					} else if (isTraitFunctionValue(currentComposed)) {
						intermediate = this.applyTraitFunctionWithValues(currentComposed, [
							x,
						]);
					} else {
						throw new Error(
							`Invalid function type in pipeline: ${(currentComposed as Value).tag}`
						);
					}

					// Apply nextFunc to the result
					if (isFunction(nextFunc) || isNativeFunction(nextFunc)) {
						return nextFunc.fn(intermediate);
					} else if (isTraitFunctionValue(nextFunc)) {
						return this.applyTraitFunctionWithValues(nextFunc, [intermediate]);
					} else {
						throw new Error(
							`Invalid function type in pipeline: ${(nextFunc as Value).tag}`
						);
					}
				});
			} else {
				throw new Error(
					`Cannot compose non-functions in pipeline: ${valueToString(
						composed
					)} and ${valueToString(nextFunc)}`
				);
			}
		}

		return composed;
	}

	private evaluateBinary(expr: BinaryExpression): Value {
		if (expr.operator === ';') {
			// Handle semicolon operator (sequence)
			// Evaluate left expression and discard result
			this.evaluateExpression(expr.left);
			// Evaluate and return right expression
			return this.evaluateExpression(expr.right);
		} else if (expr.operator === '&&') {
			// Short-circuit: only evaluate right if left is True
			const left = this.evaluateExpression(expr.left);
			if (!boolValue(left)) return left;
			return this.evaluateExpression(expr.right);
		} else if (expr.operator === '||') {
			// Short-circuit: only evaluate right if left is False
			const left = this.evaluateExpression(expr.left);
			if (boolValue(left)) return left;
			return this.evaluateExpression(expr.right);
		} else if (expr.operator === '|') {
			// Handle thrush operator
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			// Support trait-function partial application: map (add 1) | [1,2,3]
			if (right.tag === 'trait-function') {
				const tf = right;
				const args = Array.isArray(tf.partialArgs)
					? [...tf.partialArgs, left]
					: [left];
				return this.resolveTraitFunctionWithArgs(
					tf.name,
					args,
					tf.traitRegistry || this.traitRegistry
				);
			}

			if (isFunction(right)) {
				return right.fn(left);
			} else if (isNativeFunction(right)) {
				return right.fn(left);
			} else {
				throw new Error(
					`Cannot apply non-function in thrush: ${valueToString(right)}`
				);
			}
		} else if (expr.operator === '|?') {
			// |? auto-wraps a plain (non-Option/Result-returning) right-hand
			// function's result, unlike a lawful Monad.bind (which cannot express
			// that: unifying the result type with its own wrapped form is an
			// infinite type, caught by the occurs check). So this can't delegate
			// to bind — it applies the payload directly and wraps on the way out.
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (!isAnyFunction(right)) {
				throw new Error(
					`Cannot apply non-function in safe thrush: ${valueToString(right)}`
				);
			}
			if (!isConstructor(left)) {
				throw new Error(
					`Safe thrush operator (|?) requires an Option or Result, got ${valueToString(left)}`
				);
			}

			const applyRight = (arg: Value): Value =>
				isFunction(right) || isNativeFunction(right)
					? right.fn(arg)
					: (() => {
							throw new Error(
								`Cannot apply non-function in safe thrush: ${valueToString(right)}`
							);
						})();

			if (left.name === 'None' || left.name === 'Err') {
				return left;
			}
			if (left.name === 'Some') {
				const result = applyRight(left.args[0]);
				if (isConstructor(result) && (result.name === 'Some' || result.name === 'None')) {
					return result;
				}
				return { tag: 'constructor', name: 'Some', args: [result] };
			}
			if (left.name === 'Ok') {
				const result = applyRight(left.args[0]);
				if (isConstructor(result) && (result.name === 'Ok' || result.name === 'Err')) {
					return result;
				}
				return { tag: 'constructor', name: 'Ok', args: [result] };
			}

			throw new Error(
				`Safe thrush operator (|?) requires an Option or Result, got ${left.name}`
			);
		} else if (expr.operator === '$') {
			// Handle dollar operator (low precedence function application)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);

			if (isFunction(left) || isNativeFunction(left)) {
				return left.fn(right);
			} else if (isTraitFunctionValue(left)) {
				return this.applyTraitFunctionWithValues(left, [right]);
			} else {
				throw new Error(
					`Cannot apply non-function in dollar operator: ${valueToString(left)}`
				);
			}
		} else if (expr.operator === '|>') {
			// Left-to-right composition: f |> g means g(f(x))
			const left = this.evaluateExpression(expr.left);
			const leftVal = isCell(left) ? left.value : left;
			const right = this.evaluateExpression(expr.right);
			const rightVal = isCell(right) ? right.value : right;

			if (!isAnyFunction(leftVal) || !isAnyFunction(rightVal)) {
				throw new Error(
					`Both operands of |> must be functions, got ${leftVal.tag} and ${rightVal.tag}`
				);
			}

			// Left-to-right composition: g(f(x))
			return createFunction((x: Value) => {
				// Apply left function first
				let intermediate: Value;
				if (isFunction(leftVal) || isNativeFunction(leftVal)) {
					intermediate = leftVal.fn(x);
				} else if (isTraitFunctionValue(leftVal)) {
					intermediate = this.applyTraitFunctionWithValues(leftVal, [x]);
				} else {
					throw new Error(
						`Invalid function type in |> composition: ${(leftVal as Value).tag}`
					);
				}

				// Apply right function to the result
				if (isFunction(rightVal) || isNativeFunction(rightVal)) {
					return rightVal.fn(intermediate);
				} else if (isTraitFunctionValue(rightVal)) {
					return this.applyTraitFunctionWithValues(rightVal, [intermediate]);
				} else {
					throw new Error(
						`Invalid function type in |> composition: ${(rightVal as Value).tag}`
					);
				}
			});
		} else if (expr.operator === '<|') {
			// Right-to-left composition: f <| g means f(g(x))
			const left = this.evaluateExpression(expr.left);
			const leftVal = isCell(left) ? left.value : left;
			const right = this.evaluateExpression(expr.right);
			const rightVal = isCell(right) ? right.value : right;

			if (!isAnyFunction(leftVal) || !isAnyFunction(rightVal)) {
				throw new Error(
					`Both operands of <| must be functions, got ${leftVal.tag} and ${rightVal.tag}`
				);
			}

			// Right-to-left composition: f(g(x))
			return createFunction((x: Value) => {
				// Apply right function first
				let intermediate: Value;
				if (isFunction(rightVal) || isNativeFunction(rightVal)) {
					intermediate = rightVal.fn(x);
				} else if (isTraitFunctionValue(rightVal)) {
					intermediate = this.applyTraitFunctionWithValues(rightVal, [x]);
				} else {
					throw new Error(
						`Invalid function type in <| composition: ${(rightVal as Value).tag}`
					);
				}

				// Apply left function to the result
				if (isFunction(leftVal) || isNativeFunction(leftVal)) {
					return leftVal.fn(intermediate);
				} else if (isTraitFunctionValue(leftVal)) {
					return this.applyTraitFunctionWithValues(leftVal, [intermediate]);
				} else {
					throw new Error(
						`Invalid function type in <| composition: ${(leftVal as Value).tag}`
					);
				}
			});
		} else {
			// Handle other binary operators (arithmetic, comparison, etc.)
			const left = this.evaluateExpression(expr.left);
			const right = this.evaluateExpression(expr.right);
			const leftVal = isCell(left) ? left.value : left;
			const rightVal = isCell(right) ? right.value : right;

			// Special handling for arithmetic operators - use primitive operations for basic types
			if (expr.operator === '+') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					return createNumber(leftVal.value + rightVal.value);
				}
				if (isString(leftVal) && isString(rightVal)) {
					return createString(leftVal.value + rightVal.value);
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('add')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'add',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot add ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '-') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					return createNumber(leftVal.value - rightVal.value);
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('subtract')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'subtract',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot subtract ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '*') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					return createNumber(leftVal.value * rightVal.value);
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('multiply')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'multiply',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot multiply ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '/') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					if (rightVal.value === 0) {
						return createConstructor('None', []); // None for division by zero
					}
					return createConstructor('Some', [
						createNumber(leftVal.value / rightVal.value),
					]); // Some(result)
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('divide')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'divide',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot divide ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '%') {
				if (isNumber(leftVal) && isNumber(rightVal)) {
					if (rightVal.value === 0) {
						return createConstructor('None', []); // None for modulo by zero
					}
					return createConstructor('Some', [
						createNumber(leftVal.value % rightVal.value),
					]); // Some(result)
				}
				// For complex types, try trait resolution
				if (this.isTraitFunction('modulus')) {
					try {
						const result = this.resolveTraitFunctionWithArgs(
							'modulus',
							[leftVal, rightVal],
							this.traitRegistry
						);
						return result;
					} catch (_e) {
						// Fall through to error
					}
				}
				throw new Error(
					`Cannot modulus ${leftVal?.tag || 'unit'} and ${rightVal?.tag || 'unit'}`
				);
			}

			if (expr.operator === '==' || expr.operator === '!=') {
				const result = this.evaluateEquality(
					leftVal,
					rightVal,
					this.traitRegistry
				);
				return expr.operator === '!='
					? createBool(!boolValue(result))
					: result;
			}

			const operator = this.environment.get(expr.operator);
			const operatorVal = isCell(operator) ? operator.value : operator;
			if (operatorVal && isNativeFunction(operatorVal)) {
				const fn: any = operatorVal.fn(leftVal);
				if (typeof fn === 'function') {
					return fn(rightVal);
				} else if (isFunction(fn)) {
					return fn.fn(rightVal);
				} else if (isNativeFunction(fn)) {
					return fn.fn(rightVal);
				}
				throw new Error(`Operator ${expr.operator} did not return a function`);
			}

			throw new Error(`Unknown operator: ${expr.operator}`);
		}
	}

	private evaluateIf(expr: IfExpression): Value {
		const condition = this.evaluateExpression(expr.condition);

		// Check if condition is truthy - handle tagged boolean values
		let isTruthy = false;
		if (isBool(condition)) {
			isTruthy = boolValue(condition);
		} else if (isNumber(condition)) {
			isTruthy = condition.value !== 0;
		} else if (isString(condition)) {
			isTruthy = condition.value !== '';
		} else if (isUnit(condition)) {
			isTruthy = true;
		} else {
			// For other types (functions, lists, records), consider them truthy
			isTruthy = true;
		}

		if (isTruthy) {
			return this.evaluateExpression(expr.then);
		} else {
			return this.evaluateExpression(expr.else);
		}
	}

	/**
	 * Legacy direct import evaluation — used when a custom (mock) fs is present.
	 * Preserves backward compatibility for tests that inject a fake filesystem.
	 */
	private evaluateImportDirect(expr: ImportExpression): Value {
		const filePath = expr.path.endsWith('.noo') ? expr.path : `${expr.path}.noo`;
		let fullPath: string;
		if (this.path.isAbsolute(filePath)) {
			fullPath = filePath;
		} else if (this.currentFileDir) {
			fullPath = this.path.resolve(this.currentFileDir, filePath);
		} else {
			fullPath = this.path.resolve(filePath);
		}
		const content = this.fs.readFileSync(fullPath, 'utf8');
		const lexer = new Lexer(content);
		const tokens = lexer.tokenize();
		const program = parse(tokens);
		const tempEvaluator = new Evaluator({
			fs: this.fs,
			path: this.path,
			traitRegistry: this.traitRegistry,
		});
		const result = tempEvaluator.evaluateProgram(program, fullPath);
		return result.finalResult;
	}

	private evaluateImport(expr: ImportExpression): Value {
		// Guard: if using a custom (mock) fs, fall back to direct evaluation
		// so existing tests with mock filesystems continue to work.
		if (this.fs !== defaultFs) {
			return this.evaluateImportDirect(expr);
		}

		try {
			// Delegate to the hermetic module loader (Phase 1 Step 2).
			// Resolve relative to the current file's directory if available.
			const { resolveModulePath, loadModule } = require('../module-loader') as typeof import('../module-loader');
			const realpath = resolveModulePath(expr.path, this.currentFileDir);
			const cached = loadModule(realpath);

			// Trait dispatch resolves a value's constructor to its variant type
			// name; imported variants were defined in the module's own evaluator,
			// so their constructor→variant entries must arrive via the cache
			for (const [typeName, adtEntry] of cached.adtDiff) {
				for (const ctorName of adtEntry.constructors.keys()) {
					this.constructorVariants.set(ctorName, typeName);
				}
			}

			// Merge the imported module's trait implementations (§4) into this
			// evaluator's traitRegistry so cross-module dispatch works. Each impl
			// carries BOTH its AST `functions` and its pre-evaluated
			// `evaluatedFunctions` closures — so the AST fallback is real and the
			// two maps cannot fall out of sync.
			//
			// (In the normal pipeline the evaluator shares its registry with the
			// typer, which already merged these via mergeModuleCacheIntoTypeState;
			// this loop makes the evaluator self-contained and idempotent.)
			for (const [traitName, byType] of cached.traitImplDiff) {
				if (!this.traitRegistry.implementations.has(traitName)) {
					this.traitRegistry.implementations.set(traitName, new Map());
				}
				const traitImpls = this.traitRegistry.implementations.get(traitName)!;
				for (const [typeName, impl] of byType) {
					if (!traitImpls.has(typeName)) {
						// Add the shared impl reference (has functions + evaluatedFunctions).
						traitImpls.set(typeName, impl);
					} else {
						// Existing entry: backfill evaluated closures if missing so a
						// later dispatch prefers the home-module closure over re-eval.
						const existing = traitImpls.get(typeName)!;
						if (!existing.evaluatedFunctions && impl.evaluatedFunctions) {
							existing.evaluatedFunctions = impl.evaluatedFunctions;
						}
					}
				}
			}

			// Also merge trait definition metadata so dispatch can find function names
			for (const [traitName, traitDef] of cached.traitDefDiff) {
				if (!this.traitRegistry.definitions.has(traitName)) {
					this.traitRegistry.definitions.set(traitName, traitDef);
					for (const fnName of traitDef.functions.keys()) {
						const existing = this.traitRegistry.functionTraits.get(fnName) ?? [];
						if (!existing.includes(traitName)) {
							this.traitRegistry.functionTraits.set(fnName, [...existing, traitName]);
						}
					}
					if (!this.traitRegistry.implementations.has(traitName)) {
						this.traitRegistry.implementations.set(traitName, new Map());
					}
				}
			}

			return cached.exportValue;
		} catch (error) {
			let errorMessage: string;
			if (error instanceof Error) {
				errorMessage = error.message;
				if (error.stack) {
					errorMessage += '\nStack trace:\n' + error.stack;
				}
			} else if (typeof error === 'object') {
				try {
					errorMessage = JSON.stringify(error, null, 2);
				} catch (_e) {
					errorMessage = String(error);
				}
			} else {
				errorMessage = String(error);
			}

			const filePath = expr.path.endsWith('.noo')
				? expr.path
				: `${expr.path}.noo`;
			const fullPath = this.currentFileDir
				? this.path.resolve(this.currentFileDir, filePath)
				: this.path.resolve(filePath);

			const structuredError = createError(
				'ImportError',
				`Failed to import '${
					expr.path
				}': ${errorMessage}\n  Tried to resolve: ${fullPath}\n  Current working directory: ${process.cwd()}\n  Importing file directory: ${
					this.currentFileDir || 'unknown'
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
			throw structuredError;
		}
	}

	private evaluateRecord(expr: RecordExpression): Value {
		const record: { [key: string]: Value } = {};
		for (const field of expr.fields) {
			let val = this.evaluateExpression(field.value);
			if (isCell(val)) val = val.value;
			record[field.name] = val;
		}
		return createRecord(record);
	}

	private evaluateAccessor(expr: AccessorExpression): Value {
		// Return a function that takes a record and returns the field value
		return createNativeFunction(
			`@${expr.field}${expr.optional ? '?' : ''}`,
			(record: Value): Value => {
				if (isRecord(record)) {
					const field = expr.field;
					const fieldWithAt = `@${field}`;

					// Try field with @ prefix first (new format), then without (legacy format)
					if (fieldWithAt in record.fields) {
						const val = record.fields[fieldWithAt];
						return expr.optional ? createConstructor('Some', [val]) : val;
					} else if (field in record.fields) {
						const val = record.fields[field];
						return expr.optional ? createConstructor('Some', [val]) : val;
					}
				}
				if (expr.optional) {
					// None constructor when not found
					return createConstructor('None', []);
				}
				throw new Error(`Field '${expr.field}' not found in record`);
			}
		);
	}

	private evaluateWhere(expr: WhereExpression): Value {
		// Use environment stacking for where clause
		return this.withNewEnvironment(() => {
			// Evaluate all definitions in the where clause
			for (const def of expr.definitions) {
				if (def.kind === 'definition') {
					const value = this.evaluateExpression(def.value);
					this.environment.set(def.name, value);
				} else if (def.kind === 'mutable-definition') {
					const value = this.evaluateExpression(def.value);
					this.environment.set(def.name, createCell(value));
				} else if (def.kind === 'tuple-destructuring') {
					this.evaluateTupleDestructuring(def);
				} else if (def.kind === 'record-destructuring') {
					this.evaluateRecordDestructuring(def);
				}
			}
			// Evaluate the main expression
			return this.evaluateExpression(expr.main);
		});
	}

	// Efficient environment stack management
	private pushEnvironment(): void {
		this.environmentStack.push(this.environment);
		this.environment = new Map(this.environment);
	}

	private popEnvironment(): void {
		if (this.environmentStack[0]) {
			// biome-ignore lint/style/noNonNullAssertion: we checked
			this.environment = this.environmentStack.pop()!;
		}
	}

	private withNewEnvironment<T>(fn: () => T): T {
		this.pushEnvironment();
		try {
			return fn();
		} finally {
			this.popEnvironment();
		}
	}

	// Get the current environment (useful for debugging)
	getEnvironment(): Map<string, Value> {
		return new Map(
			Array.from(this.environment.entries()).map(([k, v]) => [
				k,
				isCell(v) ? v.value : v,
			])
		);
	}

	// Check if a function name is a trait function
	private isTraitFunction(functionName: string): boolean {
		if (!this.traitRegistry) return false;

		// Check if any trait defines this function
		for (const traitDef of this.traitRegistry.definitions.values()) {
			if (traitDef.functions.has(functionName)) {
				return true;
			}
		}
		return false;
	}

	// Handle trait function application at runtime
	private evaluateTraitFunctionApplication(
		traitFunc: {
			name: string;
			partialArgs?: Value[];
			traitRegistry: TraitRegistry;
		},
		argExprs: Expression[]
	): Value {
		if (!this.traitRegistry) {
			throw new Error(
				`No trait registry available for trait function ${traitFunc.name}`
			);
		}

		// Evaluate the arguments to get their runtime values
		const argValues = argExprs.map(arg => this.evaluateExpression(arg));

		// For partial application, return a curried function that accumulates arguments
		// until we have enough information to do trait dispatch
		if (traitFunc.partialArgs) {
			// This is already a partially applied trait function - add more arguments
			const allArgs = [...traitFunc.partialArgs, ...argValues];
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				allArgs,
				traitFunc.traitRegistry
			);
		} else {
			// This is the first application - start accumulating arguments
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				argValues,
				this.traitRegistry
			);
		}
	}

	private applyRegisteredTraitFunction(
		functionName: string,
		argValues: Value[],
		traitRegistry: TraitRegistry,
		dispatchValue = argValues[0]
	): Value | null {
		const dispatchTypeName = this.getValueTypeName(dispatchValue);
		for (const [traitName, traitDef] of traitRegistry.definitions) {
			if (!traitDef.functions.has(functionName)) continue;
			const impl = traitRegistry.implementations
				.get(traitName)
				?.get(dispatchTypeName);
			const hasEvaluated = impl?.evaluatedFunctions?.has(functionName);
			const hasAst = impl?.functions.has(functionName);
			if (!impl || (!hasEvaluated && !hasAst)) continue;
			let result = hasEvaluated
				? (impl.evaluatedFunctions!.get(functionName) as Value)
				: this.evaluateExpression(impl.functions.get(functionName)!);
			for (const argument of argValues) {
				if (isFunction(result) || isNativeFunction(result)) {
					result = result.fn(argument);
				} else {
					throw new Error(
						'Cannot apply argument to non-function during trait resolution'
					);
				}
			}
			return result;
		}
		return null;
	}

	private evaluateEquality(
		left: Value,
		right: Value,
		traitRegistry: TraitRegistry
	): Value {
		if (isNumber(left) && isNumber(right)) {
			return createBool(left.value === right.value);
		}
		if (isString(left) && isString(right)) {
			return createBool(left.value === right.value);
		}
		if (isUnit(left) && isUnit(right)) return createBool(true);

		const registered = this.applyRegisteredTraitFunction(
			'equals',
			[left, right],
			traitRegistry
		);
		if (registered) return registered;

		const structural = compareStructuralValues(
			left,
			right,
			(a, b) => boolValue(this.evaluateEquality(a, b, traitRegistry)),
			value => this.constructorVariants.has(value.name)
		);
		if (structural !== null) return createBool(structural);
		throw new Error(
			`Cannot compare ${left?.tag || 'unit'} and ${right?.tag || 'unit'} for equality`
		);
	}

	private resolveTraitFunctionWithArgs(
		functionName: string,
		argValues: Value[],
		traitRegistry: TraitRegistry
	): Value {
		// Get the type names of the arguments for trait resolution
		const argTypeNames = argValues.map(val => this.getValueTypeName(val));

		// Try to resolve the trait function based on different arguments
		// For Functor map: try the last argument (container) first
		const possibleDispatchIndices =
			argTypeNames.length > 1 ? [argTypeNames.length - 1, 0] : [0];

		for (const dispatchIndex of possibleDispatchIndices) {
			const result = this.applyRegisteredTraitFunction(
				functionName,
				argValues,
				traitRegistry,
				argValues[dispatchIndex]
			);
			if (result) return result;
		}

		if (functionName === 'equals' && argValues.length >= 2) {
			return this.evaluateEquality(argValues[0], argValues[1], traitRegistry);
		}

		// If we get here, we don't have enough type info yet - return a partial application
		// that will try again when more arguments are provided
		if (argTypeNames.every(t => t === 'Unknown') || argTypeNames.length < 2) {
			return {
				tag: 'trait-function',
				name: functionName,
				traitRegistry: traitRegistry,
				partialArgs: argValues,
			};
		}

		// No implementation found even with type info
		const knownTypes = argTypeNames.filter(t => t !== 'Unknown');
		const typeStr = knownTypes.length > 0 ? knownTypes.join(', ') : 'Unknown';
		throw new Error(
			`No implementation of trait function ${functionName} for ${typeStr}`
		);
	}

	private getValueTypeName(value: Value): string {
		// Get a type name from a runtime value for constraint resolution
		if (isNumber(value)) return 'Float';
		if (isString(value)) return 'String';
		if (isBool(value)) return 'Bool';
		if (isList(value)) return 'List';
		if (isRecord(value)) return 'Record';
		if (isTuple(value)) return 'Tuple';
		if (isConstructor(value)) {
			// Resolve the constructor to its variant type; fall back to the
			// constructor name for values whose definition this evaluator never
			// saw (e.g. constructed by an imported module)
			return this.constructorVariants.get(value.name) ?? value.name;
		}
		return 'Unknown';
	}

	private evaluateTypeDefinition(expr: TypeDefinitionExpression): Value {
		// Type definitions add constructors to the environment
		for (const _constructor of expr.constructors) {
			this.constructorVariants.set(_constructor.name, expr.name);
			if (_constructor.args.length === 0) {
				// Nullary constructor: just create the constructor value
				const constructorValue = {
					tag: 'constructor',
					name: _constructor.name,
					args: [],
				} as Value;
				this.environment.set(_constructor.name, constructorValue);
			} else {
				// Create a simple constructor function that collects all arguments
				const createCurriedConstructor = (arity: number, name: string) => {
					const collectArgs = (collectedArgs: Value[] = []): Value => {
						return createFunction((nextArg: Value) => {
							const newArgs = [...collectedArgs, nextArg];
							if (newArgs.length === arity) {
								return { tag: 'constructor', name, args: newArgs } as Value;
							} else {
								return collectArgs(newArgs);
							}
						});
					};
					return collectArgs();
				};

				this.environment.set(
					_constructor.name,
					createCurriedConstructor(_constructor.args.length, _constructor.name)
				);
			}
		}

		// Type definitions evaluate to unit
		return createUnit();
	}

	private evaluateUserDefinedType(_expr: UserDefinedTypeExpression): Value {
		// User-defined types are type-level definitions, similar to ADTs
		// They don't create runtime values, but could define type constructors
		// For now, they just evaluate to unit like type definitions

		return createUnit();
	}

	private evaluateMatch(expr: MatchExpression): Value {
		// Evaluate the expression being matched
		const value = this.evaluateExpression(expr.expression);
		for (const matchCase of expr.cases) {
			const matchResult = matchPattern(matchCase.pattern, value);
			if (matchResult.matched) {
				return this.withNewEnvironment(() => {
					for (const [name, boundValue] of matchResult.bindings) {
						this.environment.set(name, boundValue);
					}
					return this.evaluateExpression(matchCase.expression);
				});
			}
		}
		throw new Error('No pattern matched in match expression');
	}

	// Apply trait function directly with runtime values (used by $ operator)
	private applyTraitFunctionWithValues(
		traitFunc: {
			name: string;
			partialArgs?: Value[];
			traitRegistry: TraitRegistry;
		},
		argValues: Value[]
	): Value {
		if (!this.traitRegistry) {
			throw new Error(
				`No trait registry available for trait function ${traitFunc.name}`
			);
		}

		// For partial application, return a curried function that accumulates arguments
		// until we have enough information to do trait dispatch
		if (traitFunc.partialArgs) {
			// This is already a partially applied trait function - add more arguments
			const allArgs = [...traitFunc.partialArgs, ...argValues];
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				allArgs,
				traitFunc.traitRegistry
			);
		} else {
			// This is the first application - start accumulating arguments
			return this.resolveTraitFunctionWithArgs(
				traitFunc.name,
				argValues,
				traitFunc.traitRegistry
			);
		}
	}
}
