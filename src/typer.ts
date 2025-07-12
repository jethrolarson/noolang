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
  Effect,
  intType,
  stringType,
  boolType,
  listType,
  functionType,
  typeVariable,
  unknownType,
  unitType,
  listTypeWithElement,
  tupleType,
  recordType,
  resultType,
  optionType,
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
    // Arithmetic operators (pure)
    this.environment.set('+', functionType([intType(), intType()], intType()));
    this.environment.set('-', functionType([intType(), intType()], intType()));
    this.environment.set('*', functionType([intType(), intType()], intType()));
    this.environment.set('/', functionType([intType(), intType()], intType()));

    // Comparison operators (pure)
    this.environment.set('==', functionType([typeVariable('a'), typeVariable('a')], boolType()));
    this.environment.set('!=', functionType([typeVariable('a'), typeVariable('a')], boolType()));
    this.environment.set('<', functionType([intType(), intType()], boolType()));
    this.environment.set('>', functionType([intType(), intType()], boolType()));
    this.environment.set('<=', functionType([intType(), intType()], boolType()));
    this.environment.set('>=', functionType([intType(), intType()], boolType()));

    // List operations (pure)
    this.environment.set('head', functionType([listTypeWithElement(typeVariable('a'))], typeVariable('a')));
    this.environment.set('tail', functionType([listTypeWithElement(typeVariable('a'))], listTypeWithElement(typeVariable('a'))));
    this.environment.set('cons', functionType([typeVariable('a'), listTypeWithElement(typeVariable('a'))], listTypeWithElement(typeVariable('a'))));

    // Pipeline operator (pure)
    this.environment.set('|>', functionType([typeVariable('a'), functionType([typeVariable('a')], typeVariable('b'))], typeVariable('b')));

    // Semicolon operator (effectful - effects are unioned)
    this.environment.set(';', functionType([typeVariable('a'), typeVariable('b')], typeVariable('b')));

    // Effectful functions
    this.environment.set('print', functionType([typeVariable('a')], typeVariable('a'), ['log']));

    // List utility functions (pure)
    this.environment.set('map', functionType([functionType([typeVariable('a')], typeVariable('b')), listTypeWithElement(typeVariable('a'))], listTypeWithElement(typeVariable('b'))));
    this.environment.set('filter', functionType([functionType([typeVariable('a')], boolType()), listTypeWithElement(typeVariable('a'))], listTypeWithElement(typeVariable('a'))));
    this.environment.set('reduce', functionType([functionType([typeVariable('b'), typeVariable('a')], typeVariable('b')), typeVariable('b'), listTypeWithElement(typeVariable('a'))], typeVariable('b')));
    this.environment.set('length', functionType([listTypeWithElement(typeVariable('a'))], intType()));
    this.environment.set('isEmpty', functionType([listTypeWithElement(typeVariable('a'))], boolType()));
    this.environment.set('append', functionType([listTypeWithElement(typeVariable('a')), listTypeWithElement(typeVariable('a'))], listTypeWithElement(typeVariable('a'))));

    // Math utilities (pure)
    this.environment.set('abs', functionType([intType()], intType()));
    this.environment.set('max', functionType([intType(), intType()], intType()));
    this.environment.set('min', functionType([intType(), intType()], intType()));

    // String utilities (pure)
    this.environment.set('concat', functionType([stringType(), stringType()], stringType()));
    this.environment.set('toString', functionType([typeVariable('a')], stringType()));
  }

  private freshTypeVariable(): Type {
    return typeVariable(`t${this.typeVariableCounter++}`);
  }

  private extractEffects(type: Type): Effect[] {
    if (type.kind === 'function') {
      return type.effects;
    }
    return [];
  }

  private unionEffects(effects1: Effect[], effects2: Effect[]): Effect[] {
    const union = new Set<Effect>([...effects1, ...effects2]);
    return Array.from(union);
  }

  private addEffectsToType(type: Type, effects: Effect[]): Type {
    if (effects.length === 0) {
      return type;
    }
    
    if (type.kind === 'function') {
      return {
        ...type,
        effects: this.unionEffects(type.effects, effects)
      };
    }
    
    // If the type isn't a function, wrap it in a function that has the effects
    return functionType([], type, effects);
  }

  typeProgram(program: Program): Type[] {
    const types: Type[] = [];
    
    for (const statement of program.statements) {
      const type = this.typeExpression(statement);
      types.push(type);
    }
    
    return types;
  }

  typeAndDecorate(program: Program): Program {
    // Type check and decorate each statement
    for (const statement of program.statements) {
      const type = this.typeExpression(statement);
      statement.type = type;
    }
    
    return program;
  }

  private typeDefinition(def: DefinitionExpression): void {
    const type = this.typeExpression(def.value);
    this.environment.set(def.name, type);
  }

  typeExpression(expr: Expression): Type {
    let type: Type;
    
    switch (expr.kind) {
      case 'literal':
        type = this.typeLiteral(expr);
        break;
      
      case 'variable':
        type = this.typeVariable(expr);
        break;
      
      case 'function':
        type = this.typeFunction(expr);
        break;
      
      case 'application':
        type = this.typeApplication(expr);
        break;
      
      case 'pipeline':
        type = this.typePipeline(expr);
        break;
      
      case 'binary':
        type = this.typeBinary(expr);
        break;
      
      case 'if':
        type = this.typeIf(expr);
        break;
      
      case 'definition':
        this.typeDefinition(expr);
        type = unitType(); // Return unit type for definitions
        break;
      
      case 'import':
        type = this.typeImport(expr);
        break;
      
      case 'record':
        type = this.typeRecord(expr);
        break;
      
      case 'accessor':
        type = this.typeAccessor(expr);
        break;
      
      case 'list':
        type = this.typeList(expr);
        break;
      
      case 'tuple':
        type = this.typeTuple(expr);
        break;
      
      case 'record':
        type = this.typeRecord(expr);
        break;
      
      case 'unit':
        type = unitType();
        break;
      
      case 'typed':
        // For typed expressions, validate that the explicit type matches the inferred type
        const inferredType = this.typeExpression(expr.expression);
        const explicitType = expr.type;
        
        if (!this.typesCompatible(inferredType, explicitType)) {
          throw new Error(`Type annotation mismatch: expected ${this.typeToString(explicitType)}, but inferred ${this.typeToString(inferredType)}`);
        }
        
        type = explicitType; // Use the explicit type
        break;
      
      default:
        throw new Error(`Unknown expression kind: ${(expr as Expression).kind}`);
    }
    
    // Decorate the expression with its type
    expr.type = type;
    return type;
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
      // For now, assume all lists have Int elements
      // In a more sophisticated system, we'd infer the element type
      return listTypeWithElement(intType());
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
    
    let paramTypes: Type[] = [];
    if (expr.params.length === 0) {
      // Treat as a function from unit to return type
      paramTypes = [unitType()];
      functionEnv.set('_unit', unitType());
    } else {
      // Assign fresh type variables to parameters
      for (const param of expr.params) {
        const paramType = this.freshTypeVariable();
        paramTypes.push(paramType);
        functionEnv.set(param, paramType);
      }
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

      // Return the function's return type with its effects
      return this.addEffectsToType(funcType.return, funcType.effects);
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

    // Special handling for semicolon sequences (effect union)
    if (expr.operator === ';') {
      // For sequences: type is rightmost expression, effects are union of all expressions
      const leftEffects = this.extractEffects(leftType);
      const rightEffects = this.extractEffects(rightType);
      const unionEffects = this.unionEffects(leftEffects, rightEffects);
      
      // Return rightmost type with unioned effects
      return this.addEffectsToType(rightType, unionEffects);
    }

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

  private typeImport(expr: any): Type {
    // For now, assume imports return a record type
    return recordType({});
  }

  private typeRecord(expr: any): Type {
    const fields: { [key: string]: Type } = {};
    for (const field of expr.fields) {
      fields[field.name] = this.typeExpression(field.value);
    }
    return recordType(fields);
  }

  private typeAccessor(expr: any): Type {
    // Accessors return functions that take a record and return the field type
    return functionType([recordType({})], typeVariable('a'));
  }

  private typeTuple(expr: any): Type {
    const elements = expr.elements.map((element: any) => this.typeExpression(element));
    return tupleType(elements);
  }

  private typeList(expr: any): Type {
    if (expr.elements.length === 0) {
      // Empty list - we can't infer the element type
      return listTypeWithElement(typeVariable('a'));
    }
    
    // Infer the type from the first element
    const firstElementType = this.typeExpression(expr.elements[0]);
    
    // Check that all elements have the same type
    for (let i = 1; i < expr.elements.length; i++) {
      const elementType = this.typeExpression(expr.elements[i]);
      if (!this.typesCompatible(firstElementType, elementType)) {
        throw new Error(`List elements must have the same type: ${this.typeToString(firstElementType)} vs ${this.typeToString(elementType)}`);
      }
    }
    
    return listTypeWithElement(firstElementType);
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
    
    if (t1.kind === 'list' && t2.kind === 'list') {
      return this.typesCompatible(t1.element, t2.element);
    }
    
    if (t1.kind === 'tuple' && t2.kind === 'tuple') {
      if (t1.elements.length !== t2.elements.length) {
        return false;
      }
      
      for (let i = 0; i < t1.elements.length; i++) {
        if (!this.typesCompatible(t1.elements[i], t2.elements[i])) {
          return false;
        }
      }
      
      return true;
    }
    
    if (t1.kind === 'record' && t2.kind === 'record') {
      const t1Keys = Object.keys(t1.fields);
      const t2Keys = Object.keys(t2.fields);
      
      if (t1Keys.length !== t2Keys.length) {
        return false;
      }
      
      for (const key of t1Keys) {
        if (!t2.fields[key]) {
          return false;
        }
        
        if (!this.typesCompatible(t1.fields[key], t2.fields[key])) {
          return false;
        }
      }
      
      return true;
    }
    
    if (t1.kind === 'result' && t2.kind === 'result') {
      return this.typesCompatible(t1.success, t2.success) && 
             this.typesCompatible(t1.error, t2.error);
    }
    
    if (t1.kind === 'option' && t2.kind === 'option') {
      return this.typesCompatible(t1.element, t2.element);
    }
    
    if (t1.kind === 'unit' && t2.kind === 'unit') {
      return true;
    }
    
    return false;
  }

  typeToString(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        return type.name;
      case 'function':
        const paramStr = type.params.map(this.typeToString.bind(this)).join(' ');
        const effectStr = type.effects.length > 0 ? ` !${type.effects.join(' !')}` : '';
        return `(${paramStr}) -> ${this.typeToString(type.return)}${effectStr}`;
      case 'variable':
        return type.name;
      case 'list':
        return `List ${this.typeToString(type.element)}`;
      case 'tuple':
        const elementStr = type.elements.map(this.typeToString.bind(this)).join(' ');
        return `(${elementStr})`;
      case 'record':
        const fieldStr = Object.entries(type.fields)
          .map(([name, fieldType]) => `${name}: ${this.typeToString(fieldType)}`)
          .join(' ');
        return `{ ${fieldStr} }`;
      case 'result':
        return `Result ${this.typeToString(type.success)} ${this.typeToString(type.error)}`;
      case 'option':
        return `Option ${this.typeToString(type.element)}`;
      case 'unit':
        return 'unit';
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

  // Print the current type environment in a readable format
  printTypeEnvironment(program: Program): void {
    console.log('Global Type Environment:');
    for (const [name, type] of this.environment) {
      console.log(`  ${name}: ${this.typeToString(type)}`);
    }
    
    console.log('\nLocal Type Environment (after typing):');
    for (const [name, type] of this.environment) {
      console.log(`  ${name}: ${this.typeToString(type)}`);
    }
  }
} 