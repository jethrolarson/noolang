/**
 * Runtime trait dispatch on variants defined in an imported module.
 *
 * Dispatch resolves a value's constructor to its variant type name via the
 * evaluator's constructor→variant map. That map is populated when a type
 * definition is *evaluated locally* — for imported variants it must arrive
 * through the module cache merge, or dispatch falls back to the constructor
 * name and misses the impl (multi-constructor variants misdispatch; only
 * single-constructor variants whose constructor happens to share the type's
 * name work by coincidence).
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expectSuccess } from '../utils';
import { clearModuleCache } from '../../src/module-loader';

const TMPDIR = path.join(process.cwd(), '.test-tmp-cross-module-dispatch');

function writeTmp(relPath: string, content: string): string {
	const fullPath = path.join(TMPDIR, relPath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, 'utf8');
	return fullPath;
}

function nooPath(relPath: string): string {
	return path.join(TMPDIR, relPath).replace(/\.noo$/, '');
}

beforeEach(() => {
	fs.mkdirSync(TMPDIR, { recursive: true });
	clearModuleCache();
});

afterEach(() => {
	fs.rmSync(TMPDIR, { recursive: true, force: true });
});

describe('cross-module trait dispatch on imported variants', () => {
	beforeEach(() => {
		writeTmp(
			'shapes.noo',
			`
variant Shape = Circle Float | Square Float;
implement Show Shape (
  show = fn s => match s (
    Circle r => concat "circle:" (show r);
    Square w => concat "square:" (show w)
  )
);
{@circle fn r => Circle r, @square fn w => Square w}
`
		);
	});

	test('show dispatches on an imported multi-constructor variant value', () => {
		expectSuccess(
			`
{@circle} = import "${nooPath('shapes.noo')}";
show (circle 2)
`,
			'circle:2'
		);
	});

	test('both constructors of the imported variant dispatch to the same impl', () => {
		expectSuccess(
			`
{@circle, @square} = import "${nooPath('shapes.noo')}";
concat (show (circle 1)) (concat " " (show (square 3)))
`,
			'circle:1 square:3'
		);
	});
});
