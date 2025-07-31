import { test, expect } from 'bun:test';
import {
	getOperatorMapping,
	getRequiredTrait,
	getTraitFunction,
	shouldUseTraitSystem,
} from '../../src/typer/operator-traits';

test('should map + operator to Add trait', () => {
	const mapping = getOperatorMapping('+');
	expect(mapping).toEqual({
		operator: '+',
		traitName: 'Add',
		functionName: 'add',
	});
});

test('should map == operator to Eq trait', () => {
	const mapping = getOperatorMapping('==');
	expect(mapping).toEqual({
		operator: '==',
		traitName: 'Eq',
		functionName: 'equals',
	});
});

test('should return null for unknown operator', () => {
	const mapping = getOperatorMapping('@');
	expect(mapping).toBeNull();
});

test('should get required trait for + operator', () => {
	const trait = getRequiredTrait('+');
	expect(trait).toBe('Add');
});

test('should get trait function for == operator', () => {
	const func = getTraitFunction('==');
	expect(func).toBe('equals');
});

test('should return false for trait system usage (Phase 1)', () => {
	const shouldUse = shouldUseTraitSystem('+');
	expect(shouldUse).toBe(false);
});
