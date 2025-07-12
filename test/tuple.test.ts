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

describe('Tuple Native Functions', () => {
  const evaluateSource = (source: string) => {
    const evaluator = new Evaluator();
    const lexer = new Lexer(source);
    return evaluator.evaluateProgram(parse(lexer.tokenize()));
  };

  describe('tupleLength', () => {
    test('length of empty tuple', () => {
      const source = 'tuple = {}; tupleLength tuple';
      // { } is now unit, not an empty tuple, so this should throw an error
      expect(() => evaluateSource(source)).toThrow('tupleLength requires a tuple');
    });
    test('length of singleton tuple', () => {
      const source = 'tuple = { 1 }; tupleLength tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toBe(1);
    });
    test('length of pair tuple', () => {
      const source = 'tuple = { 1, 2 }; tupleLength tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toBe(2);
    });
  });

  describe('tupleToList', () => {
    test('converts tuple to list', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleToList tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toEqual([1, 2, 3]);
    });
  });

  describe('tupleNth', () => {
    test('gets first element', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleNth 0 tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toBe(1);
    });
    test('gets second element', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleNth 1 tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toBe(2);
    });
    test('gets last element', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleNth 2 tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toBe(3);
    });
    test('throws error for out of bounds index', () => {
      const source = 'tuple = { 1, 2 }; tupleNth 5 tuple';
      expect(() => evaluateSource(source)).toThrow('Index 5 out of bounds for tuple of length 2');
    });
  });

  describe('tupleSet', () => {
    test('sets element at index', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleSet 1 tuple 99';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toEqual([1, 99, 3]);
    });
    test('sets first element', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleSet 0 tuple 99';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toEqual([99, 2, 3]);
    });
    test('throws error for out of bounds index', () => {
      const source = 'tuple = { 1, 2 }; tupleSet 5 tuple 99';
      expect(() => evaluateSource(source)).toThrow('Index 5 out of bounds for tuple of length 2');
    });
  });



  describe('tupleIsEmpty', () => {
    test('returns true for empty tuple', () => {
      const source = 'tuple = {}; tupleIsEmpty tuple';
      // { } is now unit, not an empty tuple, so this should throw an error
      expect(() => evaluateSource(source)).toThrow('tupleIsEmpty requires a tuple');
    });
    test('returns false for non-empty tuple', () => {
      const source = 'tuple = { 1, 2, 3 }; tupleIsEmpty tuple';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toBe(false);
    });
  });

  describe('tupleConcat', () => {
    test('concatenates two tuples', () => {
      const source = 'tuple1 = { 1, 2 }; tuple2 = { 3, 4 }; tupleConcat tuple1 tuple2';
      const result = evaluateSource(source);
      expect(unwrapValue(result.finalResult)).toEqual([1, 2, 3, 4]);
    });
    test('concatenates with empty tuple', () => {
      const source = 'tuple1 = { 1, 2, 3 }; tuple2 = {}; tupleConcat tuple1 tuple2';
      // { } is now unit, not an empty tuple, so this should throw an error
      expect(() => evaluateSource(source)).toThrow('tupleConcat requires two tuples');
    });
  });
}); 