import {
  Expression,
  Program,
  DefinitionExpression,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  ApplicationExpression,
  PipelineExpression,
  BinaryExpression,
  IfExpression,
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

    // Pipeline operator
    this.environment.set('|>', functionType([typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))], typeVariable('b')));

    // Semicolon operator (left must be Nil, returns right type)
    this.environment.set(';', functionType([{ kind: 'primitive', name: 'Nil' }, typeVariable('b')], typeVariable('b')));

    // Utility functions
    this.environment.set('print', functionType([typeVariable('a')], typeVariable('a')));

    // List utility functions
    this.environment.set('map', functionType([functionType([typeVariable('a')], typeVariable('b')), listType()], listType()));
    this.environment.set('filter', functionType([functionType([typeVariable('a')], boolType()), listType()], listType()));
    this.environment.set('reduce', functionType([functionType([typeVariable('b'), typeVariable('a')], typeVariable('b')), typeVariable('b'), listType()], typeVariable('b')));
    this.environment.set('length', functionType([listType()], intType()));
    this.environment.set('isEmpty', functionType([listType()], boolType()));
    this.environment.set('append', functionType([listType(), listType()], listType()));

    // Math utilities
    this.environment.set('abs', functionType([intType()], intType()));
    this.environment.set('max', functionType([intType(), intType()], intType()));
    this.environment.set('min', functionType([intType(), intType()], intType()));

    // String utilities
    this.environment.set('concat', functionType([stringType(), stringType()], stringType()));
    this.environment.set('toString', functionType([typeVariable('a')], stringType()));
  }

  private freshTypeVariable(): Type {
    return typeVariable(`t${this.typeVariableCounter++}`);
  }

  typeProgram(program: Program): Type[] {
    const types: Type[] = [];
    
    for (const statement of program.statements) {
      types.push(this.typeExpression(statement));
    }
    
    return types;
  }

  private typeDefinition(def: DefinitionExpression): void {
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
      
      case 'definition':
        this.typeDefinition(expr);
        return { kind: 'primitive', name: 'Nil' }; // Return Nil type for definitions
      
      default:
        throw new Error(`Unknown expression kind: ${(expr as Expression).kind}`);
    }
  }

  private typeLiteral(expr: LiteralExpression): Type {
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

  private typeVariable(expr: VariableExpression): Type {
    const type = this.environment.get(expr.name);
    if (type === undefined) {
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    return type;
  }

  private typeFunction(expr: FunctionExpression): Type {
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

  private typeApplication(expr: ApplicationExpression): Type {
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

  private typePipeline(expr: PipelineExpression): Type {
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

  private typeBinary(expr: BinaryExpression): Type {
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

  private typeIf(expr: IfExpression): Type {
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