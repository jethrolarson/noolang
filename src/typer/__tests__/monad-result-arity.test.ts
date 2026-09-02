/**
 * Regression: calling the `Monad Result` trait method `bind` used to
 * corrupt `Result`'s arity during type inference.
 *
 * Root cause: the `Monad m` trait signature (`bind : m a -> (a -> m b) -> m b`)
 * models `m` as a unary type constructor. `Result a b` is binary — its second
 * (error) type parameter is never mentioned by the trait signature at all.
 * When `unify` bound the `m` placeholder to a concrete `Result a b`, it
 * dropped that extra argument; `substitute` then rebuilt every later `m ...`
 * occurrence using only the placeholder's own (single) arg slot, silently
 * truncating a real `Result a b` down to a malformed one-arg `Result a`.
 * That malformed type then collided with a genuinely two-arg `Result`
 * elsewhere in the same expression, throwing "Variant arity mismatch:
 * Result has 1 vs 2 type arguments" even though the program was well-typed.
 *
 * Fixed in unify.ts (tryUnifyConstrainedVariant) by binding the placeholder
 * to the concrete constructor's *extra* trailing args only, and in
 * substitute.ts by appending those extras after each occurrence's own args
 * instead of discarding them.
 */
import { describe, test, expect } from 'bun:test';
import { expectSuccess, parseAndType } from '../../../test/utils';
import { typeToString } from '../helpers';

describe('Monad Result trait dispatch preserves Result arity', () => {
	test('bind on a Result infers a two-arg Result type', () => {
		const decorated = parseAndType('bind (Ok 1) (fn x => Ok (x + 1))');
		const inferred = typeToString(
			decorated.type!,
			decorated.state.substitution
		);
		expect(inferred).toBe('Result Float a');
	});

	test('bind runs Ok through the success branch', () => {
		expectSuccess('bind (Ok 1) (fn x => Ok (x + 1))', {
			tag: 'constructor',
			name: 'Ok',
			args: [{ tag: 'number', value: 2 }],
		});
	});

	test('bind short-circuits on Err', () => {
		expectSuccess(
			'bind (Err "boom") (fn x => Ok (x + 1)) : Result Float String',
			{
				tag: 'constructor',
				name: 'Err',
				args: [{ tag: 'string', value: 'boom' }],
			}
		);
	});

	test('bind inside an explicitly-ascribed function keeps Result at two args', () => {
		// Shape mirrors the std/json.noo `json_field` bug: an ascribed function
		// whose body calls the trait's `bind` on a `Result` value must not
		// trip a spurious arity error against the ascription's own `Result`.
		expectSuccess(
			`variant JsonError = JsonMissingField String;
			 f = fn key members => bind (Ok members) (fn ms =>
			   match (assoc_get key ms) (
			     Some found => Ok found;
			     None => Err (JsonMissingField key)
			   )
			 ) : String -> List {String, Float} -> Result Float JsonError;
			 f "x" [{"x", 1}]`,
			{
				tag: 'constructor',
				name: 'Ok',
				args: [{ tag: 'number', value: 1 }],
			}
		);
	});
});
