import { Position, Location, createPosition, createLocation } from '../ast';

export type TokenType =
	| 'IDENTIFIER'
	| 'NUMBER'
	| 'STRING'
	| 'BOOLEAN'
	| 'OPERATOR'
	| 'PUNCTUATION'
	| 'KEYWORD'
	| 'COMMENT'
	| 'ACCESSOR'
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
		return this.position + 1 >= this.input.length
			? '\0'
			: this.input[this.position + 1];
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

	// Skip any run of whitespace (spaces, tabs, newlines)
	private skipWhitespace(): void {
		while (!this.isEOF() && /\s/.test(this.peek())) {
			this.advance();
		}
		// Also skip comments
		this.skipComment();
	}

	private skipComment(): void {
		if (this.peek() === '#') {
			// Skip the # character
			this.advance();
			// Skip everything until newline or EOF
			while (!this.isEOF() && this.peek() !== '\n') {
				this.advance();
			}
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

		// Read the first character (must be letter or underscore)
		if (!this.isEOF() && /[a-zA-Z_]/.test(this.peek())) {
			value += this.advance();
		}

		// Read subsequent characters (can be letters, digits, or underscores)
		while (!this.isEOF() && /[a-zA-Z0-9_]/.test(this.peek())) {
			value += this.advance();
		}

		// Special case for mut! - check if we have "mut" followed by "!"
		if (value === 'mut' && !this.isEOF() && this.peek() === '!') {
			value += this.advance(); // consume the !
		}

		// Check if it's a keyword
		const keywords = [
			'if',
			'then',
			'else',
			'let',
			'in',
			'fn',
			'import',
			'mut',
			'mut!',
			'where',
			'variant',
			'type',
			'match',
			'with',
			'given',
			'is',
			'has',
			'and',
			'or',
			'implements',
			'constraint',
			'implement',
			// Primitive type names
			'Float',
			'Number',
			'String',
			'Unit',
			'List',
			'Unknown',
		];
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
		const operators = [
			'|?',
			'|>',
			'<|',
			'==',
			'!=',
			'<=',
			'>=',
			'=>',
			'->',
			'+',
			'-',
			'*',
			'%',
			'/',
			'<',
			'>',
			'=',
			'|',
			'$',
		];

		// Try to match multi-character operators first
		for (const op of operators) {
			if (
				this.input.substring(this.position, this.position + op.length) === op
			) {
				value = op;
				for (let i = 0; i < op.length; i++) {
					this.advance();
				}
				break;
			}
		}

		// If no multi-character operator matched, try single character
		if (!value && /[+\-*/%<>=!|$]/.test(this.peek())) {
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

	private readAccessor(): Token {
		const start = this.createPosition();
		this.advance(); // consume @
		let field = '';

		// Read letters, digits, and underscores after @
		while (!this.isEOF() && /[a-zA-Z0-9_]/.test(this.peek())) {
			field += this.advance();
		}

		// Optional accessor suffix '?'
		if (!this.isEOF() && this.peek() === '?') {
			this.advance();
			field += '?';
		}

		return {
			type: 'ACCESSOR',
			value: field,
			location: this.createLocation(start),
		};
	}

	private createPosition(): Position {
		return createPosition(this.line, this.column);
	}

	private createLocation(start: Position): Location {
		return createLocation(start, this.createPosition());
	}

	nextToken(): Token {
		// Skip any whitespace (spaces, tabs, newlines)
		this.skipWhitespace();

		if (this.isEOF()) {
			return {
				type: 'EOF',
				value: '',
				location: this.createLocation(this.createPosition()),
			};
		}

		const char = this.peek();

		// If the next character is still whitespace, skip it and get the next token
		if (/\s/.test(char)) {
			this.advance();
			return this.nextToken();
		}

		if (char === '"' || char === "'") {
			return this.readString();
		}

		if (/[a-zA-Z]/.test(char)) {
			return this.readIdentifier();
		}

		// Handle underscore - if followed by letter/digit, it's an identifier
		// if by itself, it's punctuation
		if (char === '_') {
			if (!this.isEOF() && /[a-zA-Z0-9]/.test(this.peekNext())) {
				return this.readIdentifier();
			} else {
				// Check if this is in a function parameter context
				// Look ahead to see if we have "fn _ =>" pattern
				const lookAhead = this.input.slice(this.position);
				if (lookAhead.match(/^_\s*=>/)) {
					// Check if preceded by "fn " (function parameter)
					const precedingStart = Math.max(0, this.position - 10); // Look back further
					const preceding = this.input.slice(precedingStart, this.position);
					// Check for function context patterns
					if (preceding.match(/fn\s*$/)) {
						// This is a function parameter, treat as identifier
						return this.readIdentifier();
					}
				}
				// Default: treat as wildcard pattern punctuation
				return this.readPunctuation();
			}
		}

		if (/\d/.test(char)) {
			return this.readNumber();
		}

		if (/[+\-*/%<>=!|$]/.test(char)) {
			return this.readOperator();
		}

		if (/[(),;:[\]{}_]/.test(char)) {
			return this.readPunctuation();
		}

		// Handle accessors
		if (char === '@') {
			return this.readAccessor();
		}

		// Handle comments
		if (char === '#') {
			this.skipComment();
			// After skipping comment, get the next token
			return this.nextToken();
		}

		// Unknown character
		const start = this.createPosition();
		const value = this.advance();
		// If the unknown character is whitespace, skip it and get the next token
		if (/\s/.test(value)) {
			return this.nextToken();
		}
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
