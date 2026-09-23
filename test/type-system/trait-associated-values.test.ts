import { expect, test } from 'bun:test';
import {
	assertListType,
	assertPrimitiveType,
	parseAndType,
} from '../utils';

// Future feature marker; see docs/internal/ideas/TRAIT_ASSOCIATED_VALUES.md.
test.skip('traits can declare associated values', () => {
	const result = parseAndType(`
      constraint Container containerType (
          empty : containerType a;
          insert : a -> containerType a -> containerType a
      );

      implement Container (typefn a => List a) (
          empty = [];
          insert = fn x list => cons x list
      );

      empty : List Float
  `);

	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toBe('Float');
});
