import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeAndDecorate } from '../../../src/typer/decoration';

describe('Top-level Constraint and Implement Definitions', () => {
	const runConstraintCode = (code: string) => {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		const ast = parse(tokens);
		const typedResult = typeAndDecorate(ast);
		return typedResult;
	};

	test('should parse constraint definition at top level', () => {
		const code = `constraint Show a ( show : a -> String )`;
		const result = runConstraintCode(code);

		expect(result.program.statements).toHaveLength(1);
		expect(result.program.statements[0].kind).toBe('constraint-definition');

		const constraintDef = result.program.statements[0] as any;
		expect(constraintDef.name).toBe('Show');
		expect(constraintDef.typeParams).toEqual(['a']);
		expect(constraintDef.functions).toHaveLength(1);
		expect(constraintDef.functions[0].name).toBe('show');
	});

	test('should parse implement definition at top level', () => {
		const code = `
      constraint Show a ( show : a -> String );
      implement Show Int ( show = toString )
    `;
		const result = runConstraintCode(code);

		expect(result.program.statements).toHaveLength(1);
		expect(result.program.statements[0].kind).toBe('binary');

		// Navigate the binary expression tree: constraint ; implement
		const binaryExpr = result.program.statements[0] as any;
		expect(binaryExpr.operator).toBe(';');
		expect(binaryExpr.left.kind).toBe('constraint-definition');
		expect(binaryExpr.right.kind).toBe('implement-definition');

		const constraintDef = binaryExpr.left;
		expect(constraintDef.name).toBe('Show');

		const implementDef = binaryExpr.right;
		expect(implementDef.constraintName).toBe('Show');
		expect((implementDef.typeExpr as any).name).toBe('Int');
		expect(implementDef.implementations).toHaveLength(1);
		expect(implementDef.implementations[0].name).toBe('show');
	});

	test('should resolve constraint functions from implementations', () => {
		const code = `
      constraint Show a ( show : a -> String );
      implement Show Int ( show = toString );
      x = show 42
    `;
		const result = runConstraintCode(code);

		expect(result.program.statements).toHaveLength(1);
		expect(result.program.statements[0].kind).toBe('binary');

		// Navigate the binary expression tree: (constraint ; implement) ; definition
		const outerBinary = result.program.statements[0] as any;
		expect(outerBinary.operator).toBe(';');
		expect(outerBinary.left.kind).toBe('binary'); // constraint ; implement
		expect(outerBinary.right.kind).toBe('definition'); // x = show 42

		const definition = outerBinary.right;
		expect(definition.name).toBe('x');
	});

	test('should support multiple constraint functions', () => {
		const code = `
      constraint Eq a ( 
        equals : a -> a -> Bool; 
        notEquals : a -> a -> Bool 
      );
      implement Eq Int ( 
        equals = fn a b => a == b;
        notEquals = fn a b => a != b
      );
      result = equals 1 2
    `;
		const result = runConstraintCode(code);

		expect(result.program.statements).toHaveLength(1);
		expect(result.program.statements[0].kind).toBe('binary');

		// Navigate the binary expression tree: (constraint ; implement) ; definition
		const outerBinary = result.program.statements[0] as any;
		const innerBinary = outerBinary.left; // constraint ; implement

		const constraintDef = innerBinary.left;
		expect(constraintDef.kind).toBe('constraint-definition');
		expect(constraintDef.functions).toHaveLength(2);
		expect(constraintDef.functions[0].name).toBe('equals');
		expect(constraintDef.functions[1].name).toBe('notEquals');

		const implementDef = innerBinary.right;
		expect(implementDef.kind).toBe('implement-definition');
		expect(implementDef.implementations).toHaveLength(2);
		expect(implementDef.implementations[0].name).toBe('equals');
		expect(implementDef.implementations[1].name).toBe('notEquals');
	});
});
