import { afterEach, beforeEach, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { clearModuleCache } from '../../src/module-loader';
import { expectSuccess } from '../utils';

const TMPDIR = path.join(process.cwd(), '.test-tmp-associated-values');

beforeEach(() => {
	fs.mkdirSync(TMPDIR, { recursive: true });
	clearModuleCache();
});

afterEach(() => {
	fs.rmSync(TMPDIR, { recursive: true, force: true });
});

test('associated values retain their defining environment through imports', () => {
	const modulePath = path.join(TMPDIR, 'defaults.noo');
	fs.writeFileSync(
		modulePath,
		`constraint Default value (default : value);
		 helper = 41;
		 implement Default Float (default = helper + 1);
		 default : Float`,
		'utf8'
	);

	const importPath = `./${path
		.relative(process.cwd(), modulePath)
		.replace(/\.noo$/, '')}`;
	const result = expectSuccess(
		`exported = import "${importPath}"; {exported, default : Float}`,
		[42, 42]
	);
	expect(result.finalType).toBe('{Float, Float}');
});
