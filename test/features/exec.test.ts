// exec's error type must be a real variant, not a phantom type variable —
// `Result String a` lets a match treat the Err payload as any type at all.
import { test, expect } from 'bun:test';
import { runCode, expectSuccess } from '../utils';

test('exec has a concrete ExecError type, not a type variable', () => {
	const { finalType } = runCode('exec');
	expect(finalType).toContain('Result String ExecError');
	expect(finalType).toContain('!ffi');
});

test('exec success returns Ok stdout', () => {
	expectSuccess(
		`match (exec "printf" ["hi"]) ( Ok out => out; Err _ => "err" )`,
		'hi'
	);
});

test('exec nonzero exit returns Err (CommandFailed with code)', () => {
	expectSuccess(
		`match (exec "false" []) (
			Ok _ => -1;
			Err e => match e (
				CommandFailed info => @code info;
				ExecFailed _ => -2
			)
		)`,
		1
	);
});

test('CommandFailed preserves stdout from the failed process', () => {
	expectSuccess(
		`match (exec "sh" ["-c", "echo kept-output; exit 3"]) (
			Ok _ => "ok";
			Err e => match e (
				CommandFailed info => @stdout info;
				ExecFailed _ => "spawn"
			)
		)`,
		expect.stringContaining('kept-output')
	);
});

test('exec failure carries stderr text', () => {
	expectSuccess(
		`match (exec "ls" ["/definitely-no-such-path-xyz"]) (
			Ok _ => "ok";
			Err e => match e (
				CommandFailed info => @stderr info;
				ExecFailed message => "spawn"
			)
		)`,
		expect.stringContaining('No such file')
	);
});

test('ExecError has a Show implementation', () => {
	expectSuccess(
		`match (exec "false" []) ( Ok _ => "ok"; Err e => show e )`,
		expect.stringContaining('CommandFailed')
	);
});
