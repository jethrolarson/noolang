import { Evaluator, Value } from '../src/evaluator';
import { parse } from '../src/parser/parser';
import { Lexer } from '../src/lexer';

function unwrapValue(val: Value): any {
  if (val === null) return null;
  if (typeof val !== 'object') return val;
  switch (val.tag) {
    case 'number': return val.value;
    case 'string': return val.value;
    case 'boolean': return val.value;
    case 'list': return val.values.map(unwrapValue);
    case 'tuple': return val.values.map(unwrapValue);
    case 'record': {
      const obj: any = {};
      for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
      return obj;
    }
    default: return val;
  }
}

describe('Closure behavior', () => {
  function evalNoo(src: string) {
    const lexer = new Lexer(src);
    const tokens = lexer.tokenize();
    const program = parse(tokens);
    const evaluator = new Evaluator();
    return evaluator.evaluateProgram(program).finalResult;
  }

  test('simple closure: makeAdder', () => {
    const src = `
      makeAdder = fn x => fn y => x + y;
      add5 = makeAdder 5;
      result = add5 10;
      result
    `;
    expect(unwrapValue(evalNoo(src))).toBe(15);
  });

  test('closure in a record', () => {
    const src = `
      makeCounter = fn start => {
        @inc fn x => x + 1;
        @get fn => start
      };
      counter = makeCounter 10;
      result = (@get counter);
      result
    `;
    expect(unwrapValue(evalNoo(src))).toBe(10);
  });
}); 