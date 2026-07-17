// Runtime trait dispatch must resolve by the variant's *type* name, not the
// constructor name — a Show impl for `Foo` must fire for value `Bar "hi"`.
import { test } from 'bun:test';
import { expectSuccess } from '../utils';

test('trait dispatch works for user-defined variant with payload', () => {
	expectSuccess(
		`variant Foo = Bar String | Baz;
		 implement Show Foo (show = fn f => match f (Bar s => s; Baz => "baz"));
		 show (Bar "hi")`,
		'hi'
	);
});

test('trait dispatch works for nullary constructors of user variants', () => {
	expectSuccess(
		`variant Light = Red | Amber | Green;
		 implement Show Light (show = fn l => match l (Red => "stop"; Amber => "wait"; Green => "go"));
		 show Amber`,
		'wait'
	);
});

test('trait dispatch works for stdlib file-IO error variants', () => {
	expectSuccess(`show (FileNotFound "/x")`, 'FileNotFound(/x)');
});
