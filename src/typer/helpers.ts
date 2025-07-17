import { Type, functionType, typeVariable } from "../ast";
import { formatTypeError } from "./type-errors";
import { NoolangError } from "../errors";

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
