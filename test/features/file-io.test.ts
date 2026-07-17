// readFile/writeFile return Result instead of throwing — the types must not
// claim IO can't fail.
import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCode, expectSuccess } from '../utils';

const dir = mkdtempSync(join(tmpdir(), 'noo-file-io-'));
const existing = join(dir, 'exists.txt');
const missing = join(dir, 'no-such-file.txt');
const out = join(dir, 'out.txt');
const outInMissingDir = join(dir, 'no-such-dir', 'out.txt');
writeFileSync(existing, 'hello');

test('readFile has type Result String ReadError with !read', () => {
	const { finalType } = runCode('readFile');
	expect(finalType).toContain('Result String ReadError');
	expect(finalType).toContain('!read');
});

test('readFile on an existing file returns Ok content', () => {
	expectSuccess(
		`match (readFile "${existing}") ( Ok content => content; Err e => "err" )`,
		'hello'
	);
});

test('readFile on a missing file returns Err (FileNotFound path), not a crash', () => {
	expectSuccess(
		`match (readFile "${missing}") (
			Ok _ => "ok";
			Err e => match e (
				FileNotFound path => path;
				ReadPermissionDenied _ => "denied";
				ReadFailed _ => "failed"
			)
		)`,
		missing
	);
});

test('writeFile has type Result {} WriteError with !write', () => {
	const { finalType } = runCode('writeFile');
	expect(finalType).toContain('Result');
	expect(finalType).toContain('WriteError');
	expect(finalType).toContain('!write');
});

test('writeFile success returns Ok and writes the file', () => {
	expectSuccess(
		`match (writeFile "${out}" "written") ( Ok _ => "ok"; Err _ => "err" )`,
		'ok'
	);
	expect(readFileSync(out, 'utf-8')).toBe('written');
});

test('writeFile into a missing directory returns Err, not a crash', () => {
	expectSuccess(
		`match (writeFile "${outInMissingDir}" "x") (
			Ok _ => "ok";
			Err e => match e (
				WritePermissionDenied _ => "denied";
				WriteFailed _ => "failed"
			)
		)`,
		'failed'
	);
});

test('cleanup', () => {
	rmSync(dir, { recursive: true, force: true });
});
