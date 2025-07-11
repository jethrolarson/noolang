import { Position, Location, createPosition, createLocation } from './ast';

export type TokenType = 
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'OPERATOR'
  | 'PUNCTUATION'
  | 'KEYWORD'
  | 'NEWLINE'
  | 'INDENT'
  | 'DEDENT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  location: Location;
}

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private indentStack: number[] = [0];
  private pendingDedents: number = 0;

  constructor(input: string) {
    this.input = input;
  }

  private isEOF(): boolean {
    return this.position >= this.input.length;
  }

  private peek(): string {
    return this.isEOF() ? '\0' : this.input[this.position];
  }

  private peekNext(): string {
    return this.position + 1 >= this.input.length ? '\0' : this.input[this.position + 1];
  }

  private advance(): string {
    if (this.isEOF()) return '\0';
    const char = this.input[this.position];
    this.position++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private skipWhitespace(): void {
    while (!this.isEOF() && /\s/.test(this.peek()) && this.peek() !== '\n') {
      this.advance();
    }
  }

  private readNumber(): Token {
    const start = this.createPosition();
    let value = '';

    while (!this.isEOF() && /\d/.test(this.peek())) {
      value += this.advance();
    }

    if (this.peek() === '.' && /\d/.test(this.peekNext())) {
      value += this.advance(); // consume the dot
      while (!this.isEOF() && /\d/.test(this.peek())) {
        value += this.advance();
      }
    }

    return {
      type: 'NUMBER',
      value,
      location: this.createLocation(start),
    };
  }

  private readString(): Token {
    const start = this.createPosition();
    const quote = this.advance(); // consume opening quote
    let value = '';

    while (!this.isEOF() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        if (!this.isEOF()) {
          value += this.advance(); // consume escaped character
        }
      } else {
        value += this.advance();
      }
    }

    if (this.peek() === quote) {
      this.advance(); // consume closing quote
    }

    return {
      type: 'STRING',
      value,
      location: this.createLocation(start),
    };
  }

  private readIdentifier(): Token {
    const start = this.createPosition();
    let value = '';

    while (!this.isEOF() && /[a-zA-Z_][a-zA-Z0-9_]*/.test(this.peek())) {
      value += this.advance();
    }

    // Check if it's a keyword
    const keywords = ['if', 'then', 'else', 'let', 'in', 'true', 'false', 'fn'];
    const type = keywords.includes(value) ? 'KEYWORD' : 'IDENTIFIER';

    return {
      type,
      value,
      location: this.createLocation(start),
    };
  }

  private readOperator(): Token {
    const start = this.createPosition();
    let value = '';

    // Multi-character operators (must have spaces around them)
    const operators = ['|>', '==', '!=', '<=', '>=', '=>', '->', '+', '-', '*', '/', '<', '>', '=', '|'];
    
    // Try to match multi-character operators first
    for (const op of operators) {
      if (this.input.substring(this.position, this.position + op.length) === op) {
        value = op;
        for (let i = 0; i < op.length; i++) {
          this.advance();
        }
        break;
      }
    }

    // If no multi-character operator matched, try single character
    if (!value && /[+\-*/<>=!|]/.test(this.peek())) {
      value = this.advance();
    }

    return {
      type: 'OPERATOR',
      value,
      location: this.createLocation(start),
    };
  }

  private readPunctuation(): Token {
    const start = this.createPosition();
    const value = this.advance();

    return {
      type: 'PUNCTUATION',
      value,
      location: this.createLocation(start),
    };
  }

  private handleIndentation(): Token | null {
    if (this.peek() !== '\n') return null;

    this.advance(); // consume newline
    const start = this.createPosition();

    // Count leading spaces
    let indentLevel = 0;
    while (!this.isEOF() && this.peek() === ' ') {
      this.advance();
      indentLevel++;
    }

    // If we hit a newline, this is a blank line - skip it
    if (this.peek() === '\n') {
      return this.handleIndentation();
    }

    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (indentLevel > currentIndent) {
      // Indent
      this.indentStack.push(indentLevel);
      return {
        type: 'INDENT',
        value: '',
        location: this.createLocation(start),
      };
    } else if (indentLevel < currentIndent) {
      // Dedent
      while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length - 1] > indentLevel) {
        this.indentStack.pop();
        this.pendingDedents++;
      }
      
      if (this.pendingDedents > 0) {
        this.pendingDedents--;
        return {
          type: 'DEDENT',
          value: '',
          location: this.createLocation(start),
        };
      }
    }

    return null;
  }

  private createPosition(): Position {
    return createPosition(this.line, this.column);
  }

  private createLocation(start: Position): Location {
    return createLocation(start, this.createPosition());
  }

  nextToken(): Token {
    // Handle pending dedents
    if (this.pendingDedents > 0) {
      this.pendingDedents--;
      const start = this.createPosition();
      return {
        type: 'DEDENT',
        value: '',
        location: this.createLocation(start),
      };
    }

    // Skip whitespace (but not newlines)
    this.skipWhitespace();

    // Handle indentation
    const indentToken = this.handleIndentation();
    if (indentToken) return indentToken;

    if (this.isEOF()) {
      return {
        type: 'EOF',
        value: '',
        location: this.createLocation(this.createPosition()),
      };
    }

    const char = this.peek();

    if (/\d/.test(char)) {
      return this.readNumber();
    }

    if (char === '"' || char === "'") {
      return this.readString();
    }

    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifier();
    }

    if (/[+\-*/<>=!|]/.test(char)) {
      return this.readOperator();
    }

    if (/[(),;:\[\]{}]/.test(char)) {
      return this.readPunctuation();
    }

    // Unknown character
    const start = this.createPosition();
    const value = this.advance();
    return {
      type: 'PUNCTUATION',
      value,
      location: this.createLocation(start),
    };
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token;

    do {
      token = this.nextToken();
      tokens.push(token);
    } while (token.type !== 'EOF');

    return tokens;
  }
} 