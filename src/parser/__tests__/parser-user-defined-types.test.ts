import { describe, expect, test } from 'bun:test';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../parser';

const parseProgram = (source: string) => parse(new Lexer(source).tokenize());

describe('user-defined type declarations', () => {
	test.each([
		'type Foo =',
		'type Foo = { name: String }',
		'type Foo = { @name: String }',
		'type Foo = Option { name: String }',
		'type Foo = Option { @name: String }',
		'type Foo = { @name String, @age: Float }',
		'type Foo = { @profile { name: String } }',
		'type Foo = { @profile { @name: String } }',
		'type Foo = ({ name: String })',
		'type Foo = ({ @name: String })',
	])('rejects incomplete type definition %s', source => {
		expect(() => parseProgram(source)).toThrow();
	});

	test.each([
		'type Alias = String',
		'type Choice = String | Float',
		'type Profile = { @name String }',
		'type Wrapped = Option { @name String }',
		'type Parenthesized = ({ @name String })',
		'variant Maybe a = None | Some a',
	])('accepts complete type declaration %s', source => {
		expect(() => parseProgram(source)).not.toThrow();
	});

	test.each([
		'type Alias = String; "ok"',
		'(type Alias = String)',
		'{type Alias = String, "ok"}',
		'{type Alias = String}',
		'{@x (type Alias = String)}',
		'{@x type Alias = String}',
	])('accepts type declarations at expression boundaries %s', source => {
		expect(() => parseProgram(source)).not.toThrow();
	});
});
