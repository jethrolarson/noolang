import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

test('generated benchmark results stay untracked', () => {
	const ignoredPath = execFileSync(
		'git',
		['check-ignore', 'benchmark-results/example.json'],
		{ cwd: root, encoding: 'utf8' }
	).trim();
	const trackedResults = execFileSync(
		'git',
		['ls-files', 'benchmark-results'],
		{ cwd: root, encoding: 'utf8' }
	).trim();

	expect(ignoredPath).toBe('benchmark-results/example.json');
	expect(trackedResults).toBe('');
});

test('PR comparisons select the newest core result, not arbitrary JSON', () => {
	const workflow = readFileSync(
		resolve(root, '.github/workflows/ci.yml'),
		'utf8'
	);

	expect(workflow).toContain(
		'find "$1" -maxdepth 1 -type f -name "results-*.json" | sort | tail -1'
	);
	expect(workflow).toContain(
		'CURRENT_RESULTS=$(latest_core_result benchmark-results-current)'
	);
	expect(workflow).toContain(
		'MAIN_RESULTS=$(latest_core_result benchmark-results-main)'
	);
});
