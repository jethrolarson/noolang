import { test, expect } from 'bun:test';
import { runCode } from '../../../test/utils';

test('println prints a String value unquoted, same as print', () => {
	const originalLog = console.log;
	const lines: unknown[][] = [];
	console.log = (...args: unknown[]) => {
		lines.push(args);
	};
	try {
		runCode('println "hi"');
	} finally {
		console.log = originalLog;
	}
	expect(lines).toEqual([['hi']]);
});
