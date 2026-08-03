import { test, expect } from 'bun:test';
import { parseAndType, expectSuccess } from '../../../test/utils';

// Self-recursive `value_p` with two `choice` branches (array, object), where
// the object branch pairs the recursive result with a string key — used to
// throw a nonsensical unification error even though each branch alone was
// fine. Inlined instead of importing `std/parser` since it's not shipped here.
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

// Same mechanism without self-recursion: a shared helper (`sep_by`) called
// twice and combined through a result-unifying `choice2`.
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

// Collateral-risk check: `given ... has {@field Concrete}` must still reject
// a wrong field type after the fix above.
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
