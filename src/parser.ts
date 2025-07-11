import { Lexer, Token, TokenType } from './lexer';
import {
  Expression,
  Program,
  Definition,
  LiteralExpression,
  VariableExpression,
  FunctionExpression,
  ApplicationExpression,
  PipelineExpression,
  BinaryExpression,
  IfExpression,
  createLocation,
  createPosition,
} from './ast';

export class Parser {
  private tokens: Token[];
  private position: number = 0;

  constructor(input: string) {
    const lexer = new Lexer(input);
    this.tokens = lexer.tokenize();
  }

  private current(): Token {
    return this.tokens[this.position];
  }

  private peek(): Token {
    return this.position + 1 < this.tokens.length ? this.tokens[this.position + 1] : this.tokens[this.position];
  }

  private advance(): Token {
    if (this.position < this.tokens.length) {
      this.position++;
    }
    return this.current();
  }

  private match(type: TokenType): Token {
    if (this.current().type === type) {
      return this.advance();
    }
    throw new Error(`Expected ${type}, got ${this.current().type} at ${this.current().location.start.line}:${this.current().location.start.column}`);
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private consume(type: TokenType): Token {
    if (this.check(type)) {
      const token = this.current(); // Save the current token
      this.advance(); // Advance the pointer
      return token;
    }
    throw new Error(`Expected ${type}, got ${this.current().type}`);
  }

  parse(): Program {
    const statements = [];
    const start = this.current().location.start;

    while (!this.check('EOF')) {
      if (this.check('INDENT') || this.check('DEDENT')) {
        this.advance(); // skip indentation tokens
        continue;
      }

      const statement = this.parseTopLevel();
      statements.push(statement);

      // Expect semicolon after definitions
      if (statement.kind === 'definition') {
        if (this.check('PUNCTUATION') && this.current().value === ';') {
          this.advance();
        }
      }
    }

    return {
      statements,
      location: createLocation(start, this.current().location.end),
    };
  }

  private parseTopLevel(): Expression | Definition {
    // Check if this is a definition (identifier followed by = operator)
    if (
      this.check('IDENTIFIER') &&
      this.peek().type === 'OPERATOR' &&
      this.peek().value === '='
    ) {
      return this.parseDefinition();
    }
    return this.parseExpression();
  }

  private parseDefinition(): Definition {
    const nameToken = this.current();
    this.advance(); // move past IDENTIFIER
    this.consume('OPERATOR'); // consume '='
    const value = this.parseExpression();

    return {
      kind: 'definition',
      name: nameToken.value,
      value,
      location: createLocation(
        nameToken.location.start,
        value.location.end
      ),
    };
  }

  // Simplified expression parsing - everything is left-to-right
  private parseExpression(): Expression {
    return this.parsePipeline();
  }

  private parsePipeline(): Expression {
    let expr = this.parseBinary();
    while (this.check('OPERATOR') && this.current().value === '|>') {
      const op = this.advance();
      const right = this.parseBinary();
      expr = {
        kind: 'pipeline',
        steps: [expr, right],
        location: createLocation(expr.location.start, right.location.end),
      };
    }
    return expr;
  }

  private parseBinary(): Expression {
    let expr = this.parseApplication();
    while (this.check('OPERATOR') && this.isBinaryOperator(this.current().value)) {
      const opToken = this.current();
      this.advance();
      const right = this.parseApplication();
      expr = {
        kind: 'binary',
        operator: opToken.value as any,
        left: expr,
        right,
        location: createLocation(expr.location.start, right.location.end),
      };
    }
    return expr;
  }

  private isBinaryOperator(op: string): boolean {
    return ['+', '-', '*', '/', '==', '!=', '<', '>', '<=', '>='].includes(op);
  }

  private parseApplication(): Expression {
    let expr = this.parsePrimary();
    
    // Continue parsing applications left-to-right
    while (
      this.check('IDENTIFIER') ||
      this.check('NUMBER') ||
      this.check('STRING') ||
      this.check('BOOLEAN') ||
      (this.check('PUNCTUATION') && this.current().value === '(') ||
      (this.check('PUNCTUATION') && this.current().value === '[')
    ) {
      const arg = this.parsePrimary();
      expr = {
        kind: 'application',
        func: expr,
        args: [arg],
        location: createLocation(expr.location.start, arg.location.end),
      };
    }
    
    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.current();

    switch (token.type) {
      case 'NUMBER':
        this.advance();
        return {
          kind: 'literal',
          value: parseFloat(token.value),
          location: token.location,
        };

      case 'STRING':
        this.advance();
        return {
          kind: 'literal',
          value: token.value,
          location: token.location,
        };

      case 'KEYWORD':
        if (token.value === 'true' || token.value === 'false') {
          this.advance();
          return {
            kind: 'literal',
            value: token.value === 'true',
            location: token.location,
          };
        }
        if (token.value === 'if') {
          return this.parseIf();
        }
        if (token.value === 'fn') {
          return this.parseFunction();
        }
        // Fall through to identifier
        this.advance();
        return {
          kind: 'variable',
          name: token.value,
          location: token.location,
        };

      case 'IDENTIFIER':
        this.advance();
        return {
          kind: 'variable',
          name: token.value,
          location: token.location,
        };

      case 'PUNCTUATION':
        if (token.value === '(') {
          return this.parseParenthesized();
        }
        if (token.value === '[') {
          return this.parseList();
        }
        throw new Error(`Unexpected punctuation: ${token.value}`);

      default:
        throw new Error(`Unexpected token: ${token.type}`);
    }
  }

  private parseFunction(): FunctionExpression {
    this.consume('KEYWORD'); // consume 'fn'
    
    // Parse parameters (whitespace-separated identifiers)
    const params: string[] = [];
    while (this.check('IDENTIFIER')) {
      params.push(this.consume('IDENTIFIER').value);
    }
    
    // Consume the '=>' operator
    if (this.check('OPERATOR') && this.current().value === '=>') {
      this.advance(); // consume '=>'
    } else {
      throw new Error(`Expected '=>' after function parameters`);
    }
    
    const body = this.parseExpression();
    
    // Desugar multiple parameters into nested functions
    // Start with the innermost function (last parameter)
    let result: FunctionExpression = {
      kind: 'function',
      params: [params[params.length - 1]],
      body,
      location: createLocation(
        createPosition(this.current().location.start.line, this.current().location.start.column - 1),
        body.location.end
      ),
    };
    
    // Wrap in nested functions for each parameter (except the last one)
    // Work backwards from second-to-last parameter to first
    for (let i = params.length - 2; i >= 0; i--) {
      result = {
        kind: 'function',
        params: [params[i]],
        body: result,
        location: createLocation(
          createPosition(this.current().location.start.line, this.current().location.start.column - 1),
          result.location.end
        ),
      };
    }
    
    return result;
  }

  private parseParenthesized(): Expression {
    this.consume('PUNCTUATION'); // consume '('
    const expr = this.parseExpression();
    this.consume('PUNCTUATION'); // consume ')'
    return expr;
  }

  private parseIf(): IfExpression {
    this.consume('KEYWORD'); // consume 'if'
    const condition = this.parseExpression();
    this.consume('KEYWORD'); // consume 'then'
    const thenExpr = this.parseExpression();
    this.consume('KEYWORD'); // consume 'else'
    const elseExpr = this.parseExpression();

    return {
      kind: 'if',
      condition,
      then: thenExpr,
      else: elseExpr,
      location: createLocation(
        createPosition(this.current().location.start.line, this.current().location.start.column - 1),
        elseExpr.location.end
      ),
    };
  }

  private parseList(): Expression {
    this.consume('PUNCTUATION'); // consume '['
    
    const elements = [];
    while (!this.check('PUNCTUATION') || this.current().value !== ']') {
      if (this.check('PUNCTUATION') && this.current().value === ',') {
        this.advance(); // skip comma if present
        continue;
      }
      elements.push(this.parsePrimary());
      if (this.check('PUNCTUATION') && this.current().value === ']') {
        break;
      }
    }
    this.consume('PUNCTUATION'); // consume ']'
    return {
      kind: 'literal',
      value: elements,
      location: createLocation(
        createPosition(this.current().location.start.line, this.current().location.start.column - 1),
        this.current().location.end
      ),
    };
  }
} 