import { test, expect, describe } from 'bun:test';
import {
  findEnclosingDefinition,
  planInferAnnotationEdit,
  spliceText,
  type AstNode,
} from './annotation-refactor';

// Fixtures mirror the JSON shape emitted by `--ast-file` for
// `add_one = fn x => x + 1;` (unannotated) and
// `add_one = fn x => x + 1 : Float -> Float;` (annotated) — 1-based
// line/column, end-exclusive, as verified against the real CLI.

const unannotatedFn: AstNode = {
  kind: 'definition',
  name: 'add_one',
  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
  value: {
    kind: 'function',
    location: { start: { line: 1, column: 11 }, end: { line: 1, column: 25 } },
  },
};

const annotatedFn: AstNode = {
  kind: 'definition',
  name: 'add_one',
  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
  value: {
    kind: 'typed',
    location: { start: { line: 1, column: 11 }, end: { line: 1, column: 41 } },
    expression: {
      kind: 'function',
      location: { start: { line: 1, column: 11 }, end: { line: 1, column: 25 } },
    },
    type: { kind: 'function' },
  },
};

const constrainedFn: AstNode = {
  kind: 'definition',
  name: 'add_one',
  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
  value: {
    kind: 'constrained',
    location: { start: { line: 1, column: 11 }, end: { line: 1, column: 55 } },
    expression: {
      kind: 'function',
      location: { start: { line: 1, column: 11 }, end: { line: 1, column: 25 } },
    },
    type: { kind: 'function' },
    constraint: {},
  },
};

const program = (def: AstNode): AstNode => ({
  kind: 'binary',
  operator: ';',
  location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
  left: def,
  right: { kind: 'variable', name: 'add_one', location: { start: { line: 2, column: 1 }, end: { line: 2, column: 8 } } },
});

describe('findEnclosingDefinition', () => {
  test('matches when cursor is on the bound name', () => {
    const match = findEnclosingDefinition(program(unannotatedFn), 1, 3);
    expect(match?.name).toBe('add_one');
  });

  test('matches when cursor is inside the function body, not just the name', () => {
    const match = findEnclosingDefinition(program(unannotatedFn), 1, 20);
    expect(match?.name).toBe('add_one');
  });

  test('does not match a position outside both name and value', () => {
    const match = findEnclosingDefinition(program(unannotatedFn), 2, 5);
    expect(match).toBeUndefined();
  });

  test('picks the innermost definition when nested', () => {
    const inner: AstNode = {
      kind: 'definition',
      name: 'inner',
      location: { start: { line: 1, column: 12 }, end: { line: 1, column: 17 } },
      value: {
        kind: 'function',
        location: { start: { line: 1, column: 20 }, end: { line: 1, column: 30 } },
      },
    };
    const outer: AstNode = {
      kind: 'definition',
      name: 'outer',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } },
      value: {
        kind: 'function',
        location: { start: { line: 1, column: 9 }, end: { line: 1, column: 40 } },
        body: inner,
      },
    };
    const match = findEnclosingDefinition(outer, 1, 25);
    expect(match?.name).toBe('inner');
  });
});

describe('planInferAnnotationEdit', () => {
  // Real source text matching each fixture's declared columns exactly —
  // the plan now peeks at the character past the AST end position, so it
  // needs text that's actually consistent with those columns.
  const unannotatedText = 'add_one = fn x => 123456;';
  const annotatedText = 'add_one = fn x => 123456 : abcdefghijklm;';
  const constrainedText = 'f = fn x => 123456 : a -> a given a is Eq abcdefghijklm;';

  test('unannotated function: insert at the end of the function', () => {
    const plan = planInferAnnotationEdit(unannotatedFn.value as AstNode, unannotatedText);
    expect(plan).toEqual({ kind: 'insert', at: { line: 1, column: 25 } });
  });

  test('annotated function: replace from end of expression to end of annotation', () => {
    const plan = planInferAnnotationEdit(annotatedFn.value as AstNode, annotatedText);
    expect(plan).toEqual({
      kind: 'replace',
      start: { line: 1, column: 25 },
      end: { line: 1, column: 41 },
    });
  });

  test('constrained (given clause) is left alone', () => {
    const plan = planInferAnnotationEdit(constrainedFn.value as AstNode, constrainedText);
    expect(plan).toBeUndefined();
  });

  test('non-function definitions are left alone', () => {
    const plan = planInferAnnotationEdit(
      { kind: 'literal', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } },
      '1'
    );
    expect(plan).toBeUndefined();
  });

  // Regression: `(fn x => x) : Type` desugars its parens away in the AST
  // (FunctionExpression location never includes an enclosing paren), so the
  // real ')' sits in the gap between the AST's reported end and the actual
  // annotation colon. Splicing at the raw AST endpoint here would eat that
  // ')' and corrupt the file — the plan must decline instead.
  test('parenthesized unannotated function: declines rather than splice into a wrapping paren', () => {
    const text = 'add_one = (fn x => 123456);';
    // fn's own AST location ends right after "123456" (col 26) — the ")"
    // that actually follows in source is invisible to the AST node.
    const parenWrappedFn: AstNode = {
      kind: 'function',
      location: { start: { line: 1, column: 12 }, end: { line: 1, column: 26 } },
    };
    const plan = planInferAnnotationEdit(parenWrappedFn, text);
    expect(plan).toBeUndefined();
  });

  test('parenthesized annotated function: declines rather than splice into a wrapping paren', () => {
    const text = 'add_one = (fn x => 123456) : abcdefghijklm;';
    const parenWrappedTyped: AstNode = {
      kind: 'typed',
      location: { start: { line: 1, column: 12 }, end: { line: 1, column: 45 } },
      expression: {
        kind: 'function',
        location: { start: { line: 1, column: 12 }, end: { line: 1, column: 26 } },
      },
      type: { kind: 'function' },
    };
    const plan = planInferAnnotationEdit(parenWrappedTyped, text);
    expect(plan).toBeUndefined();
  });
});

describe('spliceText', () => {
  test('removes a same-line span', () => {
    const text = 'add_one = fn x => x + 1 : Float -> Float';
    const result = spliceText(
      text,
      { line: 1, column: 24 },
      { line: 1, column: 41 },
      ''
    );
    expect(result).toBe('add_one = fn x => x + 1');
  });

  test('replaces a span across multiple lines', () => {
    const text = 'a = 1;\nb = 2 : Old;\nc';
    const result = spliceText(
      text,
      { line: 2, column: 6 },
      { line: 2, column: 12 },
      ' : New'
    );
    expect(result).toBe('a = 1;\nb = 2 : New;\nc');
  });
});
