// Pure logic for the "infer type annotation" code action, kept free of any
// vscode-languageserver dependency so it can be unit tested directly against
// the --ast-file JSON shape (kind/name/value/location, 1-based line/column,
// end exclusive) without spinning up a language server connection.

export interface AstPosition {
  line: number;
  column: number;
}

export interface AstLocation {
  start: AstPosition;
  end: AstPosition;
}

export interface AstNode {
  kind: string;
  location: AstLocation;
  [key: string]: unknown;
}

export interface DefinitionMatch {
  name: string;
  value: AstNode;
}

function positionWithinLocation(loc: AstLocation, line: number, column: number): boolean {
  if (line < loc.start.line || line > loc.end.line) return false;
  if (line === loc.start.line && column < loc.start.column) return false;
  if (line === loc.end.line && column > loc.end.column) return false;
  return true;
}

function spanSize(loc: AstLocation): number {
  return (loc.end.line - loc.start.line) * 1_000_000 + (loc.end.column - loc.start.column);
}

// Finds the innermost `definition` node whose name or value covers the given
// position — a match on the value covers cursor placement anywhere in the
// function body, not just on the bound name.
export function findEnclosingDefinition(
  ast: AstNode,
  line: number,
  column: number
): DefinitionMatch | undefined {
  let best: DefinitionMatch | undefined;
  let bestSize = Infinity;

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as AstNode & { name?: unknown; value?: AstNode };
    if (
      n.kind === 'definition' &&
      typeof n.name === 'string' &&
      n.value?.location &&
      (positionWithinLocation(n.location, line, column) ||
        positionWithinLocation(n.value.location, line, column))
    ) {
      const size = spanSize(n.value.location);
      if (size < bestSize) {
        bestSize = size;
        best = { name: n.name, value: n.value };
      }
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  }
  walk(ast);
  return best;
}

export type InferAnnotationPlan =
  | { kind: 'insert'; at: AstPosition }
  | { kind: 'replace'; start: AstPosition; end: AstPosition };

export function positionToOffset(text: string, pos: AstPosition): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line - 1; i++) offset += lines[i].length + 1; // +1 for the newline
  return offset + (pos.column - 1);
}

// First non-whitespace character at or after `offset`, if any — used to
// sanity-check an AST end-position before splicing at it.
function peekNextMeaningfulChar(text: string, offset: number): string | undefined {
  let i = offset;
  while (i < text.length && /\s/.test(text[i])) i++;
  return text[i];
}

// Decides whether a definition's value is eligible for the "infer type
// annotation" action, and where the edit goes. Scoped to plain function
// values (annotated or not) — `constrained` (`: Type given ...`) is left
// alone so its constraint clause is never silently dropped.
//
// `text` is used for a safety check, not just position math: a
// parenthesized value — `(fn x => x) : Float -> Float` — desugars its
// parens away in the AST, so `expression.location.end`/`value.location.end`
// land *before* the closing `)`, short of where the annotation's colon or
// the statement's end actually is. Splicing at those raw AST endpoints in
// that case would eat the `)` and corrupt the file, so this only returns a
// plan when the character right after the AST endpoint (skipping
// whitespace) is exactly what an edit there should see — `:` for an
// existing annotation, anything but a stray closing delimiter otherwise.
export function planInferAnnotationEdit(value: AstNode, text: string): InferAnnotationPlan | undefined {
  if (value.kind === 'function') {
    const next = peekNextMeaningfulChar(text, positionToOffset(text, value.location.end));
    if (next !== undefined && ')]}'.includes(next)) return undefined;
    return { kind: 'insert', at: value.location.end };
  }
  const expression = value.expression as AstNode | undefined;
  if (value.kind === 'typed' && expression?.kind === 'function') {
    const next = peekNextMeaningfulChar(text, positionToOffset(text, expression.location.end));
    if (next !== ':') return undefined;
    return { kind: 'replace', start: expression.location.end, end: value.location.end };
  }
  return undefined;
}

// Removes the `[start, end)` span (1-based, end-exclusive, matching AST
// locations) from `text`, replacing it with `replacement`.
export function spliceText(
  text: string,
  start: AstPosition,
  end: AstPosition,
  replacement: string
): string {
  const startOffset = positionToOffset(text, start);
  const endOffset = positionToOffset(text, end);
  return text.slice(0, startOffset) + replacement + text.slice(endOffset);
}
