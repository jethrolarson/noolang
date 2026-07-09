import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import { runCode, parseAndType } from '../../../test/utils';

// Regression: a type error inside an imported module must surface. Previously
// typeImport swallowed any import failure and returned a fresh type variable,
// so misuse of a broken module silently type-checked.

const withModule = (name: string, contents: string, body: () => void) => {
	const file = `${name}.noo`;
	fs.writeFileSync(file, contents);
	try {
		body();
	} finally {
		fs.unlinkSync(file);
	}
};

test('import of a module containing a type error surfaces the error at type-check', () => {
	// Uses parseAndType (type-check only): with the swallow, misuse of the broken
	// module's value would type-check as String; with the fix it must throw.
	withModule('_test_bad_import_module', 'bad = 1 + "hello";\n{@val bad}\n', () => {
		expect(() =>
			parseAndType('m = import "_test_bad_import_module"; concat (m | @val) "x"')
		).toThrow();
	});
});

test('import of a valid module still works', () => {
	withModule(
		'_test_ok_import_module',
		'addFn = fn x y => x + y;\n{@add addFn}\n',
		() => {
			const r = runCode('{@add} = import "_test_ok_import_module"; add 2 3');
			expect(r.finalValue).toBe(5);
		}
	);
});
