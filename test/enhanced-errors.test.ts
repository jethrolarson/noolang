import { Lexer } from '../src/lexer';
import { parse } from '../src/parser/parser';
import { Typer } from '../src/typer';

describe('Enhanced Type Error Messages', () => {
  const typer = new Typer();

  test('should provide detailed undefined variable error', () => {
    const lexer = new Lexer('undefined_var');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Undefined variable/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Define 'undefined_var' before using it/);
  });

  test('should provide detailed function application error', () => {
    const lexer = new Lexer('(fn x => x + 1) "hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Type mismatch in function application/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Expected: Int/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Got:      String/);
  });

  test('should provide detailed operator type error', () => {
    const lexer = new Lexer('"hello" + 5');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Operator type mismatch/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Operator: \+/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Expected: Int/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Got:      String/);
  });

  test('should provide detailed condition type error', () => {
    const lexer = new Lexer('if 42 then 1 else 2');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Condition must be boolean/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Use a boolean expression/);
  });

  test('should provide detailed if branch type error', () => {
    const lexer = new Lexer('if true then 1 else "hello"');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/If branches must have the same type/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Expected: Int/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Got:      String/);
  });

  test('should provide detailed list element type error', () => {
    const lexer = new Lexer('[1, "hello", 3]');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/List elements must have the same type/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Expected: Int/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Got:      String/);
  });

  test('should provide detailed type annotation error', () => {
    const lexer = new Lexer('x = 42 : String');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Type annotation mismatch/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Expected: String/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Got:      Int/);
  });

  test('should provide detailed non-function application error', () => {
    const lexer = new Lexer('42 5');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Cannot apply non-function type/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Only functions can be applied to arguments/);
  });

  test('should provide detailed pipeline composition error', () => {
    const lexer = new Lexer('(fn x => x + 1) |> (fn x => x == "hello")');
    const tokens = lexer.tokenize();
    const program = parse(tokens);

    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Pipeline composition type mismatch/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Expected: String/);
    expect(() => {
      typer.typeProgram(program);
    }).toThrow(/Got:      Int/);
  });
}); 