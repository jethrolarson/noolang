import { type Type, functionType, typeVariable, type VariableType, type PrimitiveType, type FunctionType, type ListType, type TupleType, type RecordType, type UnionType, type VariantType, ConstraintExpr, Constraint, IsConstraint, HasFieldConstraint, ImplementsConstraint, CustomConstraint } from "../ast";
import { formatTypeError } from "./type-errors";
import { NoolangError } from "../errors";
import { substitute } from "./substitute";
import type { Effect } from "../ast";

type CodeLocation = {
  line: number;
  column: number;
};

// Helper: Extract location from expression or provide default
export const getExprLocation = (expr: {
  location?: { start: CodeLocation };
}): CodeLocation => ({
  line: expr.location?.start.line || 1,
  column: expr.location?.start.column || 1,
});

// Helper: Throw formatted type error with consistent pattern
export function throwTypeError(
  errorFactory: (location: CodeLocation) => NoolangError,
  location?: CodeLocation
): never {
  const loc = location || { line: 1, column: 1 };
  throw new Error(formatTypeError(errorFactory(loc)));
}

// Helper: Format effects as string for type display
export function formatEffectsString(effects: Set<Effect>): string {
  if (effects.size === 0) return "";
  return ` ${Array.from(effects).map(e => `!${e}`).join(' ')}`;
}

// Helper: Create common function types
export const createUnaryFunctionType = (
  paramType: Type,
  returnType: Type
): Type => functionType([paramType], returnType);

export const createBinaryFunctionType = (
  param1Type: Type,
  param2Type: Type,
  returnType: Type
): Type => functionType([param1Type, param2Type], returnType);

// Helper: Create polymorphic function types with type variables
export const createPolymorphicUnaryFunction = (
  paramVar: string,
  returnVar: string
): Type => functionType([typeVariable(paramVar)], typeVariable(returnVar));

export const createPolymorphicBinaryFunction = (
  param1Var: string,
  param2Var: string,
  returnVar: string
): Type =>
  functionType(
    [typeVariable(param1Var), typeVariable(param2Var)],
    typeVariable(returnVar)
  );


// Utility: mapObject for mapping over record fields
export function mapObject<T, U>(
  obj: { [k: string]: T },
  fn: (v: T, k: string) => U,
): { [k: string]: U } {
  const result: { [k: string]: U } = {};
  for (const k in obj) result[k] = fn(obj[k], k);
  return result;
}

// Utility: mapSet for immutable Map updates - optimized to avoid copying large maps
export function mapSet<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
  // For performance, avoid copying large maps unnecessarily
  if (map.has(key) && map.get(key) === value) {
    return map; // No change needed
  }
  const copy = new Map(map);
  copy.set(key, value);
  return copy;
}

// Utility: isTypeKind type guard
export function isTypeKind<T extends Type["kind"]>(
  t: Type,
  kind: T,
): t is Extract<Type, { kind: T }> {
  return t.kind === kind;
}


// Cache for typesEqual to avoid repeated deep comparisons
const typesEqualCache = new Map<string, boolean>();

// Check if two types are structurally equal
export const typesEqual = (t1: Type, t2: Type): boolean => {
  // Quick reference equality check
  if (t1 === t2) return true;
  
  if (t1.kind !== t2.kind) {
    return false;
  }
  
  // Simple cache for primitive/variable types
  if ((t1.kind === 'primitive' || t1.kind === 'variable') && (t2.kind === 'primitive' || t2.kind === 'variable')) {
    const key = `${t1.kind}:${(t1 as any).name}-${t2.kind}:${(t2 as any).name}`;
    let cached = typesEqualCache.get(key);
    if (cached !== undefined) return cached;
    
    const result = typesEqualUncached(t1, t2);
    if (typesEqualCache.size < 500) {
      typesEqualCache.set(key, result);
    }
    return result;
  }
  
  return typesEqualUncached(t1, t2);
};

const typesEqualUncached = (t1: Type, t2: Type): boolean => {

  switch (t1.kind) {
    case "variable":
      return t1.name === (t2 as VariableType).name;

    case "primitive":
      return t1.name === (t2 as PrimitiveType).name;

    case "function": {
      const f2 = t2 as FunctionType;
      if (t1.params.length !== f2.params.length) {
        return false;
      }
      return (
        t1.params.every((param, i) => typesEqual(param, f2.params[i])) &&
        typesEqual(t1.return, f2.return)
      );
    }

    case "list":
      return typesEqual(t1.element, (t2 as ListType).element);

    case "tuple": {
      const t2_tuple = t2 as TupleType;
      if (t1.elements.length !== t2_tuple.elements.length) {
        return false;
      }
      return t1.elements.every((element, i) =>
        typesEqual(element, t2_tuple.elements[i]),
      );
    }

    case "record": {
      const t2_record = t2 as RecordType;
      const keys1 = Object.keys(t1.fields);
      const keys2 = Object.keys(t2_record.fields);
      if (keys1.length !== keys2.length) {
        return false;
      }
      return keys1.every((key) =>
        typesEqual(t1.fields[key], t2_record.fields[key]),
      );
    }

    case "union": {
      const t2_union = t2 as UnionType;
      if (t1.types.length !== t2_union.types.length) {
        return false;
      }
      return t1.types.every((type, i) => typesEqual(type, t2_union.types[i]));
    }

    case "unit":
      return true;

    case "variant": {
      const t2_variant = t2 as VariantType;
      if (t1.name !== t2_variant.name) {
        return false;
      }
      if (t1.args.length !== t2_variant.args.length) {
        return false;
      }
      return t1.args.every((arg, i) => typesEqual(arg, t2_variant.args[i]));
    }

    default:
      return false;
  }
};


// Efficient type similarity check to avoid JSON.stringify (simplified for constraint comparison)
export const typesSimilar = (t1: Type, t2: Type): boolean => {
	if (t1.kind !== t2.kind) return false;

	switch (t1.kind) {
		case "primitive":
			return t1.name === (t2 as PrimitiveType).name;
		case "variable":
			return t1.name === (t2 as VariableType).name;
		case "function": {
			const t2Func = t2 as FunctionType;
			return (
				t1.params.length === t2Func.params.length &&
				t1.params.every((p, i) => typesSimilar(p, t2Func.params[i])) &&
				typesSimilar(t1.return, t2Func.return)
			);
		}
		case "list":
			return typesSimilar(t1.element, (t2 as ListType).element);
		case "record": {
			const t2Record = t2 as RecordType;
			const fields1 = Object.keys(t1.fields);
			const fields2 = Object.keys(t2Record.fields);
			return (
				fields1.length === fields2.length &&
				fields1.every(
					(f) =>
						f in t2Record.fields &&
						typesSimilar(t1.fields[f], t2Record.fields[f]),
				)
			);
		}
		case "tuple": {
			const t2Tuple = t2 as TupleType;
			return (
				t1.elements.length === t2Tuple.elements.length &&
				t1.elements.every((e, i) => typesSimilar(e, t2Tuple.elements[i]))
			);
		}
		case "union": {
			const t2Union = t2 as UnionType;
			return (
				t1.types.length === t2Union.types.length &&
				t1.types.every((type, i) => typesSimilar(type, t2Union.types[i]))
			);
		}
		default:
			return false;
	}
};

// Efficient constraint comparison to replace expensive JSON.stringify
export const constraintsEqual = (c1: Constraint, c2: Constraint): boolean => {
	if (c1.kind !== c2.kind || c1.typeVar !== c2.typeVar) return false;

	switch (c1.kind) {
		case "is":
			return c1.constraint === (c2 as IsConstraint).constraint;
		case "hasField": {
			const c2HasField = c2 as HasFieldConstraint;
			return (
				c1.field === c2HasField.field &&
				typesSimilar(c1.fieldType, c2HasField.fieldType)
			);
		}
		case "implements":
			return c1.interfaceName === (c2 as ImplementsConstraint).interfaceName;
		case "custom":
			return c1.constraint === (c2 as CustomConstraint).constraint;
		default:
			return false;
	}
};

// Helper function to propagate a constraint to matching type variables in a function type
export const propagateConstraintToTypeVariable = (
	funcType: Type,
	constraint: Constraint,
): void => {
	if (funcType.kind !== "function") return;

	// Apply constraint to matching type variables in parameters
	for (const param of funcType.params) {
		if (param.kind === "variable" && param.name === constraint.typeVar) {
			if (!param.constraints) {
				param.constraints = [];
			}
			// Check if this constraint is already present
			const existingConstraint = param.constraints.find((c) =>
				constraintsEqual(c, constraint),
			);
			if (!existingConstraint) {
				param.constraints.push(constraint);
			}
		}
	}

	// Also apply to return type if it matches
	if (
		funcType.return.kind === "variable" &&
		funcType.return.name === constraint.typeVar
	) {
		if (!funcType.return.constraints) {
			funcType.return.constraints = [];
		}
		const existingConstraint = funcType.return.constraints.find((c) =>
			constraintsEqual(c, constraint),
		);
		if (!existingConstraint) {
			funcType.return.constraints.push(constraint);
		}
	}
};

// Utility function to convert type to string
export const typeToString = (
	type: Type,
	substitution: Map<string, Type> = new Map(),
	showConstraints: boolean = true,
): string => {
	const greek = [
		"α",
		"β",
		"γ",
		"δ",
		"ε",
		"ζ",
		"η",
		"θ",
		"ι",
		"κ",
		"λ",
		"μ",
		"ν",
		"ξ",
		"ο",
		"π",
		"ρ",
		"σ",
		"τ",
		"υ",
		"φ",
		"χ",
		"ψ",
		"ω",
	];
	const mapping = new Map<string, string>();
	let next = 0;

	function norm(t: Type): string {
		switch (t.kind) {
			case "primitive":
				return t.name;
			case "function": {
				const paramStr = t.params.map(norm).join(" ");
				const effectStr = formatEffectsString(t.effects);
				const baseType = `(${paramStr}) -> ${norm(t.return)}${effectStr}`;

				const constraintStr =
					showConstraints && t.constraints && t.constraints.length > 0
						? ` given ${
								(t as any).originalConstraint
									? formatConstraintExpr((t as any).originalConstraint)
									: deduplicateConstraints(t.constraints)
											.map(formatConstraint)
											.join(" ")
							}`
						: "";
				return constraintStr ? `${baseType}${constraintStr}` : baseType;
			}
			case "variable": {
				let varStr = "";
				if (!mapping.has(t.name)) {
					// If the type variable name is a single letter, keep it as-is
					// This preserves explicit type annotations like 'a -> a'
					if (t.name.length === 1 && /^[a-z]$/.test(t.name)) {
						mapping.set(t.name, t.name);
					} else {
						mapping.set(t.name, greek[next] || `t${next}`);
						next++;
					}
				}
				// biome-ignore lint/style/noNonNullAssertion: it's set if not defined above
				varStr = mapping.get(t.name)!;

				return varStr;
			}
			case "list":
				return `List ${norm(t.element)}`;
			case "tuple":
				return `(${t.elements.map(norm).join(" ")})`;
			case "record":
				return `{ ${Object.entries(t.fields)
					.map(([name, fieldType]) => `${name}: ${norm(fieldType)}`)
					.join(" ")} }`;
			case "union":
				return `(${t.types.map(norm).join(" | ")})`;
			case "variant":
				if (t.args.length === 0) {
					return t.name;
				} else {
					return `${t.name} ${t.args.map(norm).join(" ")}`;
				}
			case "unit":
				return "unit";
			case "unknown":
				return "?";
			default:
				return "unknown";
		}
	}

	function formatConstraint(c: Constraint): string {
		switch (c.kind) {
			case "is": {
				// Use the normalized variable name for consistency
				const normalizedVarName = mapping.get(c.typeVar) || c.typeVar;
				return `${normalizedVarName} is ${c.constraint}`;
			}
			case "hasField": {
				// For hasField constraints, we need to use the normalized variable name
				// that matches the parameter it's constraining
				const normalizedVarName2 = mapping.get(c.typeVar) || c.typeVar;
				return `${normalizedVarName2} has field "${c.field}" of type ${norm(
					c.fieldType,
				)}`;
			}
			case "implements": {
				const normalizedVarName3 = mapping.get(c.typeVar) || c.typeVar;
				return `${normalizedVarName3} implements ${c.interfaceName}`;
			}
			case "custom": {
				const normalizedVarName4 = mapping.get(c.typeVar) || c.typeVar;
				return `${normalizedVarName4} satisfies ${c.constraint} ${c.args
					.map(norm)
					.join(" ")}`;
			}
			default:
				return "unknown constraint";
		}
	}

	function formatConstraintExpr(expr: ConstraintExpr): string {
		switch (expr.kind) {
			case "is":
			case "hasField":
			case "implements":
			case "custom":
				return formatConstraint(expr);
			case "and":
				return `${formatConstraintExpr(expr.left)} and ${formatConstraintExpr(
					expr.right,
				)}`;
			case "or":
				return `${formatConstraintExpr(expr.left)} or ${formatConstraintExpr(
					expr.right,
				)}`;
			case "paren":
				return `(${formatConstraintExpr(expr.expr)})`;
			default:
				return "unknown constraint";
		}
	}

	// Helper function to deduplicate constraints
	function deduplicateConstraints(constraints: Constraint[]): Constraint[] {
		const result: Constraint[] = [];

		for (const constraint of constraints) {
			const isDuplicate = result.some((c) => constraintsEqual(c, constraint));
			if (!isDuplicate) {
				result.push(constraint);
			}
		}

		return result;
	}

	// Apply substitution to the type before normalizing
	const substitutedType = substitute(type, substitution);
	return norm(substitutedType);
};

// Check if a type variable occurs in a type (for occurs check)
export const occursIn = (varName: string, type: Type): boolean => {
	switch (type.kind) {
		case "variable":
			return type.name === varName;
		case "function":
			return (
				type.params.some((param) => occursIn(varName, param)) ||
				occursIn(varName, type.return)
			);
		case "list":
			return occursIn(varName, type.element);
		case "tuple":
			return type.elements.some((element) => occursIn(varName, element));
		case "record":
			return Object.values(type.fields).some((fieldType) =>
				occursIn(varName, fieldType),
			);
		case "union":
			return type.types.some((t) => occursIn(varName, t));
		case "variant":
			return type.args.some((arg) => occursIn(varName, arg));
		default:
			return false;
	}
};