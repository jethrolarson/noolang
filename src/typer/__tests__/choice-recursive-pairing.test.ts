import { test, expect } from 'bun:test';
import { parseAndType, expectSuccess } from '../../../test/utils';

// Regression for the "self-recursive choice/pairing" bug: a self-recursive
// top-level function with two-or-more `choice` branches, where at least one
// branch pairs the recursive call's own result with a companion value inside
// a record/tuple/variant, failed to typecheck with a nonsensical unification
// error even though every branch was well-typed in isolation (the shape
// needed for e.g. parsing "a key paired with a recursively-parsed value" —
// exactly what JSON object-member parsing needs).
//
// Root cause: `generalize` decided a definition's quantifiedVars using
// `freeTypeVars`, which only walked a type's own structural shape (function
// params/return, list/tuple elements, record fields, ...) and never a type
// variable's `.constraints` payload (the `has {@field ...}` constraints that
// e.g. record-accessor typing attaches). A variable reachable only through
// such a constraint — like the element-type variable buried inside a
// generic recursive-descent helper's accumulator/result record — was never
// quantified, so `instantiate`'s freshening map had no entry for it: every
// call site of that helper shared the exact same variable, and unifying two
// differently-shaped call sites (as `choice`/`choice2` do, since every
// alternative must produce the same result type) corrupted one call site's
// element type with the other's.
//
// This is a self-contained rebuild of the filed repro (a recursive-descent
// JSON-value parser, self-recursive `value_p` with two `choice` branches —
// array and object — where the object branch pairs the recursive result
// with a string key) using plain top-level functions instead of importing
// `std/parser` (not shipped on this branch), so the test doesn't depend on
// that module's existence or API shape.
test('self-recursive function with a generic recursive-descent helper called from two choice branches, one pairing the result, typechecks', () => {
	const code = `
    result_bind = fn res f => match res (
      Ok x => f x;
      Err e => Err e
    );
    result_map = fn f res => match res (
      Ok x => Ok (f x);
      Err e => Err e
    );

    satisfy = fn label pred pos s => match (substring pos (pos + 1) s) (
      "" => Err "eof";
      c => if pred c then Ok {@value c, @pos (pos + 1)} else Err "no"
    );
    char = fn expected pos s => satisfy expected (fn c => c == expected) pos s;

    pmap = fn f p => fn pos s =>
      result_map (fn r => {@value (f (r | @value)), @pos (r | @pos)}) (p pos s);
    pbind = fn f p => fn pos s =>
      result_bind (p pos s) (fn r => (f (r | @value)) (r | @pos) s);

    many_go = fn p acc pos s => match (p pos s) (
      Err _ => Ok {@value acc, @pos pos};
      Ok r => many_go p (append acc [r | @value]) (r | @pos) s
    );
    many = fn p pos s => many_go p [] pos s;

    choice = fn ps pos s => (
      try_next = fn acc p => match acc (
        Ok r => Ok r;
        Err _ => p pos s
      );
      reduce try_next (Err "no alt") ps
    );

    sep_by_go = fn p sep acc pos s => match (sep pos s) (
      Err _ => Ok {@value acc, @pos pos};
      Ok sr => result_bind (p (sr | @pos) s) (fn r =>
        sep_by_go p sep (append acc [r | @value]) (r | @pos) s
      )
    );
    sep_by = fn p sep pos s => match (p pos s) (
      Err _ => Ok {@value [], @pos pos};
      Ok r => sep_by_go p sep [r | @value] (r | @pos) s
    );

    variant JsonValue = JNull | JArray (List JsonValue) | JObject (List {String, JsonValue});

    null_p = pmap (fn _ => JNull) (char "n");
    key_p = pmap (fn cs => join "" cs) (many (satisfy "k" (fn c => not (c == "\\""))));

    value_p = fn pos s => choice [
      null_p,
      pmap (fn items => JArray items) (sep_by value_p (char ",")),
      pmap (fn pairs => JObject pairs) (sep_by (pbind (fn k => pmap (fn v => {k, v}) value_p) key_p) (char ","))
    ] pos s;

    value_p
  `;
	expect(() => parseAndType(code)).not.toThrow();
});

// Simpler, non-recursive isolation of the same mechanism: a generic
// self-recursive helper (`sep_by`) whose element type carries a structural
// (`has`) constraint via a record accessor, called at two different element
// types and combined through a result-unifying `choice2`. Confirms the fix
// isn't specific to `value_p`'s own self-recursion.
test('a generic recursive helper called at two element types through a result-unifying combinator picks the unified type at both call sites', () => {
	const code = `
    result_bind = fn res f => match res (
      Ok x => f x;
      Err e => Err e
    );
    sep_by_go = fn p sep acc pos s => match (sep pos s) (
      Err _ => Ok {@value acc, @pos pos};
      Ok sr => result_bind (p (sr | @pos) s) (fn r =>
        sep_by_go p sep (append acc [r | @value]) (r | @pos) s
      )
    );
    sep_by = fn p sep pos s => match (p pos s) (
      Err _ => Ok {@value [], @pos pos};
      Ok r => sep_by_go p sep [r | @value] (r | @pos) s
    );
    comma_p = fn pos s => Ok {@value ",", @pos pos};
    num_p = fn pos s => Ok {@value 1, @pos pos};

    choice2 = fn p1 p2 pos s => match (p1 pos s) (
      Ok r => Ok r;
      Err _ => p2 pos s
    );

    combined = fn pos s => choice2 (sep_by num_p comma_p) (sep_by num_p comma_p) pos s;
    combined
  `;
	expect(() => parseAndType(code)).not.toThrow();
});

// Regression for the fix's own collateral risk: explicit annotations with a
// structural `given ... has {@field Concrete}` constraint must still reject
// arguments whose field has the wrong concrete type. Widening what counts
// as a "free variable" for quantification purposes (the fix above) must not
// apply to `constrained`-kind definitions, whose `has` constraint pins a
// field's type to a concrete literal via a deliberately shared, unquantified
// variable — quantifying it away silently disables the check.
test('explicit structural constraint with a concrete field type still rejects a wrong field type', () => {
	expect(() =>
		parseAndType(`
      getName = (fn obj => @name obj) : a -> String given a has {@name String};
      result = getName {@name 42}
    `)
	).toThrow();
});

test('explicit structural constraint with a concrete field type still accepts a matching field type', () => {
	const result = parseAndType(`
      getName = (fn obj => @name obj) : a -> String given a has {@name String};
      result = getName {@name "Alice"}
    `);
	expectSuccess(
		`getName = (fn obj => @name obj) : a -> String given a has {@name String}; getName {@name "Alice"}`,
		'Alice'
	);
	expect(result.type).toBeTruthy();
});
