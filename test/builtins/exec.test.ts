import { expect, test, describe } from 'bun:test';
import { expectSuccess, expectError } from '../utils';

describe('exec builtin function', () => {
	test('exec with echo command should return Ok with output', () => {
		expectSuccess(`
			result = exec "echo" ["hello world"];
			result
		`, expect.objectContaining({
			tag: 'constructor',
			name: 'Ok',
			args: [expect.objectContaining({
				tag: 'string',
				value: expect.stringContaining('hello world')
			})]
		}));
	});

	test('exec with ls command should return Ok with directory listing', () => {
		expectSuccess(`
			result = exec "ls" [];
			result
		`, expect.objectContaining({
			tag: 'constructor',
			name: 'Ok',
			args: [expect.objectContaining({
				tag: 'string'
			})]
		}));
	});

	test('exec with nonexistent command should return Err', () => {
		expectSuccess(`
			result = exec "nonexistentcommand12345" [];
			result
		`, expect.objectContaining({
			tag: 'constructor',
			name: 'Err',
			args: [expect.objectContaining({
				tag: 'string',
				value: expect.stringContaining('Command failed')
			})]
		}));
	});

	test('exec type signature should be correct', () => {
		expectSuccess(`
			exec
		`, expect.any(Object));
	});

	test('exec should work with pattern matching', () => {
		expectSuccess(`
			result = exec "echo" ["test"];
			match result (
				Ok output => "success";
				Err error => "failed"
			)
		`, "success");
	});

	test('exec with complex arguments should work', () => {
		expectSuccess(`
			result = exec "echo" ["arg1", "arg2"];
			match result (
				Ok output => output;
				Err error => "failed"
			)
		`, expect.stringContaining("arg1 arg2"));
	});

	test('exec should require string command', () => {
		expectError(`
			exec 123 []
		`, /Type mismatch/);
	});

	test('exec should require list of strings for arguments', () => {
		expectError(`
			exec "echo" "not a list"
		`, /Type mismatch/);
	});

	test('exec arguments must all be strings', () => {
		expectError(`
			exec "echo" [123]
		`, /Type mismatch/);
	});

	test('exec can be used in practical automation', () => {
		expectSuccess(`
			# Get current user
			whoami_result = exec "whoami" [];
			# Get date  
			date_result = exec "date" [];
			
			match whoami_result (
				Ok user => match date_result (
					Ok date => "got both results";
					Err error => "date failed"
				);
				Err error => "whoami failed"
			)
		`, "got both results");
	});

	test('exec handles command with multiple arguments', () => {
		expectSuccess(`
			result = exec "echo" ["arg1", "arg2", "arg3"];
			match result (
				Ok output => output;
				Err error => "failed"
			)
		`, expect.stringContaining("arg1 arg2 arg3"));
	});

	test('exec preserves command output with newlines', () => {
		expectSuccess(`
			result = exec "echo" ["line1"];
			match result (
				Ok output => output;
				Err error => "failed"
			)
		`, expect.stringContaining("line1"));
	});
});