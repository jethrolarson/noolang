import { describe, expect, test } from 'bun:test';
import { expectSuccess, parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

const inferredType = (code: string): string => {
	const decorated = parseAndType(code);
	return typeToString(decorated.type!, decorated.state.substitution);
};

describe('trait methods are instantiated at each call site', () => {
	test('JV Eq implementation can compare String keys and recursive JV values in one callback', () => {
		const code = `
variant JV = JNumber Float | JObject (List {String, JV});

implement Eq JV (
  equals = fn a b => match a (
    JNumber x => match b (JNumber y => equals x y; _ => False);
    JObject xs => match b (JObject ys => primitive_list_all2 (fn px py => (
        {kx, vx} = px;
        {ky, vy} = py;
        (equals (kx : String) ky) && (equals vx vy)
      )) xs ys; _ => False)
  )
);

equals (JNumber 1) (JNumber 1)
`;

		expect(inferredType(code)).toBe('Bool');
		expectSuccess(code, true);
	});

	test('different non-recursive Eq instances can be used in one callback', () => {
		const code = `
variant Entries = Entries (List {String, Float});
implement Eq Entries (
  equals = fn a b => match a (
    Entries xs => match b (
      Entries ys => primitive_list_all2 (fn px py => (
        {kx, vx} = px;
        {ky, vy} = py;
        (equals kx ky) && (equals vx vy)
      )) xs ys
    )
  )
);
equals (Entries [{"a", 1}]) (Entries [{"a", 1}])
`;

		expect(inferredType(code)).toBe('Bool');
		expectSuccess(code, true);
	});

	test('repeated calls at the same concrete type remain valid in one callback', () => {
		const code = `
variant Pairs = Pairs (List {Float, Float});
implement Eq Pairs (
  equals = fn a b => match a (
    Pairs xs => match b (
      Pairs ys => primitive_list_all2 (fn px py => (
        {ax, bx} = px;
        {ay, by} = py;
        (equals ax ay) && (equals bx by)
      )) xs ys
    )
  )
);
equals (Pairs [{1, 2}]) (Pairs [{1, 2}])
`;

		expect(inferredType(code)).toBe('Bool');
		expectSuccess(code, true);
	});

	test('different instances in separate match arms retain their existing boundary', () => {
		const code = `
variant Choice = Num Float | Text String | Flag Bool;
all_equal = fn value => match value (
  Num x => equals x x;
  Text x => equals x x;
  Flag x => equals x x
);
all_equal (Text "ok")
`;

		expect(inferredType(code)).toBe('Bool');
		expectSuccess(code, true);
	});

	test('ordinary let-polymorphism remains independent inside one lambda', () => {
		const code = `
identity = fn x => x;
f = fn a b => {identity a, identity b};
f 1 "hello"
`;

		expect(inferredType(code)).toBe('{Float, String}');
	});
});
