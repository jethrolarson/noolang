import {
  Expression,
  Program,
  Definition,
  Type,
  intType,
  stringType,
  boolType,
  listType,
  functionType,
  typeVariable,
  unknownType,
} from './ast';

export type TypeEnvironment = Map<string, Type>;

export class Typer {
  private environment: TypeEnvironment;
  private typeVariableCounter: number = 0;

  constructor() {
    this.environment = new Map();
    this.initializeBuiltins();
  }

  private initializeBuiltins(): void {
    // Arithmetic operators
    this.environment.set('+', functionType([intType(), intType()], intType()));
    this.environment.set('-', functionType([intType(), intType()], intType()));
    this.environment.set('*', functionType([intType(), intType()], intType()));
    this.environment.set('/', functionType([intType(), intType()], intType()));

    // Comparison operators
    this.environment.set('==', functionType([typeVariable('a'), typeVariable('a')], boolType()));
    this.environment.set('!=', functionType([typeVariable('a'), typeVariable('a')], boolType()));
    this.environment.set('<', functionType([intType(), intType()], boolType()));
    this.environment.set('>', functionType([intType(), intType()], boolType()));
    this.environment.set('<=', functionType([intType(), intType()], boolType()));
    this.environment.set('>=', functionType([intType(), intType()], boolType()));

    // List operations
    this.environment.set('head', functionType([listType()], typeVariable('a')));
    this.environment.set('tail', functionType([listType()], listType()));
    this.environment.set('cons', functionType([typeVariable('a'), listType()], listType()));

    // Utility functions
    this.environment.set('print', functionType([typeVariable('a')], typeVariable('a')));
  }

  private freshTypeVariable(): Type {
    return typeVariable(`t${this.typeVariableCounter++}`);
  }

  typeProgram(program: Program): Type[] {
    const types: Type[] = [];
    
    for (const statement of program.statements) {
      if (statement.kind === 'definition') {
        this.typeDefinition(statement);
      } else {
        types.push(this.typeExpression(statement));
      }
    }
    
    return types;
  }

  private typeDefinition(def: Definition): void {
    const type = this.typeExpression(def.value);
    this.environment.set(def.name, type);
  }

  typeExpression(expr: Expression): Type {
    switch (expr.kind) {
      case 'literal':
        return this.typeLiteral(expr);
      
      case 'variable':
        return this.typeVariable(expr);
      
      case 'function':
        return this.typeFunction(expr);
      
      case 'application':
        return this.typeApplication(expr);
      
      case 'pipeline':
        return this.typePipeline(expr);
      
      case 'binary':
        return this.typeBinary(expr);
      
      case 'if':
        return this.typeIf(expr);
      

      
      default:
        throw new Error(`Unknown expression kind: ${(expr as any).kind}`);
    }
  }

  private typeLiteral(expr: any): Type {
    const value = expr.value;
    
    if (typeof value === 'number') {
      return intType();
    } else if (typeof value === 'string') {
      return stringType();
    } else if (typeof value === 'boolean') {
      return boolType();
    } else if (Array.isArray(value)) {
      // For now, assume all lists have the same type
      // In a more sophisticated system, we'd infer the element type
      return listType();
    } else {
      return unknownType();
    }
  }

  private typeVariable(expr: any): Type {
    const type = this.environment.get(expr.name);
    if (type === undefined) {
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    return type;
  }

  private typeFunction(expr: any): Type {
    // Create new type environment for function scope
    const functionEnv = new Map(this.environment);
    
    // Assign fresh type variables to parameters
    const paramTypes: Type[] = [];
    for (const param of expr.params) {
      const paramType = this.freshTypeVariable();
      paramTypes.push(paramType);
      functionEnv.set(param, paramType);
    }

    // Create temporary typer with function environment
    const tempTyper = new Typer();
    tempTyper.environment = functionEnv;
    
    const returnType = tempTyper.typeExpression(expr.body);
    
    return functionType(paramTypes, returnType);
  }

  private typeApplication(expr: any): Type {
    const funcType = this.typeExpression(expr.func);
    const argTypes = expr.args.map((arg: Expression) => this.typeExpression(arg));

    if (funcType.kind === 'function') {
      if (funcType.params.length !== argTypes.length) {
        throw new Error(`Expected ${funcType.params.length} arguments, got ${argTypes.length}`);
      }

      // Simple type checking - in a real system, you'd do unification
      for (let i = 0; i < funcType.params.length; i++) {
        if (!this.typesCompatible(funcType.params[i], argTypes[i])) {
          throw new Error(`Type mismatch: expected ${this.typeToString(funcType.params[i])}, got ${this.typeToString(argTypes[i])}`);
        }
      }

      return funcType.return;
    } else {
      throw new Error(`Cannot apply non-function type: ${this.typeToString(funcType)}`);
    }
  }

  private typePipeline(expr: any): Type {
    let currentType = this.typeExpression(expr.steps[0]);
    
    for (let i = 1; i < expr.steps.length; i++) {
      const funcType = this.typeExpression(expr.steps[i]);
      
      if (funcType.kind === 'function') {
        if (funcType.params.length !== 1) {
          throw new Error(`Pipeline function must take exactly one argument`);
        }
        
        if (!this.typesCompatible(funcType.params[0], currentType)) {
          throw new Error(`Type mismatch in pipeline: expected ${this.typeToString(funcType.params[0])}, got ${this.typeToString(currentType)}`);
        }
        
        currentType = funcType.return;
      } else {
        throw new Error(`Cannot apply non-function type in pipeline: ${this.typeToString(funcType)}`);
      }
    }
    
    return currentType;
  }

  private typeBinary(expr: any): Type {
    const leftType = this.typeExpression(expr.left);
    const rightType = this.typeExpression(expr.right);

    // Get the operator's type from environment
    const operatorType = this.environment.get(expr.operator);
    if (!operatorType || operatorType.kind !== 'function') {
      throw new Error(`Unknown operator: ${expr.operator}`);
    }

    // Check argument types
    if (operatorType.params.length !== 2) {
      throw new Error(`Binary operator must take exactly two arguments`);
    }

    if (!this.typesCompatible(operatorType.params[0], leftType)) {
      throw new Error(`Left operand type mismatch: expected ${this.typeToString(operatorType.params[0])}, got ${this.typeToString(leftType)}`);
    }

    if (!this.typesCompatible(operatorType.params[1], rightType)) {
      throw new Error(`Right operand type mismatch: expected ${this.typeToString(operatorType.params[1])}, got ${this.typeToString(rightType)}`);
    }

    return operatorType.return;
  }

  private typeIf(expr: any): Type {
    const conditionType = this.typeExpression(expr.condition);
    const thenType = this.typeExpression(expr.then);
    const elseType = this.typeExpression(expr.else);

    // Condition should be boolean
    if (conditionType.kind !== 'primitive' || conditionType.name !== 'Bool') {
      throw new Error(`Condition must be boolean, got ${this.typeToString(conditionType)}`);
    }

    // Then and else branches should have compatible types
    if (!this.typesCompatible(thenType, elseType)) {
      throw new Error(`Type mismatch in if expression: ${this.typeToString(thenType)} vs ${this.typeToString(elseType)}`);
    }

    return thenType;
  }



  private typesCompatible(t1: Type, t2: Type): boolean {
    // Simple type compatibility check
    // In a real system, this would be more sophisticated with unification
    
    if (t1.kind === 'unknown' || t2.kind === 'unknown') {
      return true;
    }
    
    if (t1.kind === 'variable' || t2.kind === 'variable') {
      return true; // Type variables are compatible with anything
    }
    
    if (t1.kind === 'primitive' && t2.kind === 'primitive') {
      return t1.name === t2.name;
    }
    
    if (t1.kind === 'function' && t2.kind === 'function') {
      if (t1.params.length !== t2.params.length) {
        return false;
      }
      
      for (let i = 0; i < t1.params.length; i++) {
        if (!this.typesCompatible(t1.params[i], t2.params[i])) {
          return false;
        }
      }
      
      return this.typesCompatible(t1.return, t2.return);
    }
    
    return false;
  }

  private typeToString(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        return type.name;
      case 'function':
        const paramStr = type.params.map(this.typeToString.bind(this)).join(' ');
        return `(${paramStr}) -> ${this.typeToString(type.return)}`;
      case 'variable':
        return type.name;
      case 'unknown':
        return '?';
      default:
        return 'unknown';
    }
  }

  // Get the current type environment (useful for debugging)
  getTypeEnvironment(): TypeEnvironment {
    return new Map(this.environment);
  }
} 