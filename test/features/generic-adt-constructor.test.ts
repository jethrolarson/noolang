import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { runNoolang } from '../test-utils';

test('Generic ADT Constructor - should handle generic Point constructor with Float arguments', () => {
	const result = runNoolang(`
		type Point a = Point a a;
		origin = Point 0.0 0.0;
		origin
	`);

	assert.equal(result.finalValue, {
		tag: 'adt',
		constructor: 'Point',
		args: [
			{ tag: 'number', value: 0.0 },
			{ tag: 'number', value: 0.0 }
		]
	});
});

test('Generic ADT Constructor - should handle generic Shape constructor with Float argument', () => {
	const result = runNoolang(`
		type Shape a = Circle a | Rectangle a a;
		circle = Circle 5.0;
		circle
	`);

	assert.equal(result.finalValue, {
		tag: 'adt',
		constructor: 'Circle',
		args: [
			{ tag: 'number', value: 5.0 }
		]
	});
});

test('Generic ADT Constructor - should handle partial application of generic constructor', () => {
	const result = runNoolang(`
		type Point a = Point a a;
		makeOrigin = Point 0.0;
		point = makeOrigin 0.0;
		point
	`);

	assert.equal(result.finalValue, {
		tag: 'adt',
		constructor: 'Point',
		args: [
			{ tag: 'number', value: 0.0 },
			{ tag: 'number', value: 0.0 }
		]
	});
});

test('Generic ADT Constructor - should handle mixed generic types', () => {
	const result = runNoolang(`
		type Container a = Container a;
		stringContainer = Container "hello";
		numberContainer = Container 42.0;
		stringContainer
	`);

	assert.equal(result.finalValue, {
		tag: 'adt',
		constructor: 'Container',
		args: [
			{ tag: 'string', value: 'hello' }
		]
	});
});

test.run();