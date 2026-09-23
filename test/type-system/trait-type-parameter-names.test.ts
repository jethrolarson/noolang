import { test, expect } from 'bun:test';
import {
	assertListType,
	assertPrimitiveType,
	assertVariantType,
	parseAndType,
} from '../utils';

test('trait functions work with descriptive type parameter names', () => {
	const program = `
        constraint Serializable dataType (
            serialize : dataType -> String;
            deserialize : String -> dataType
        );
        
        implement Serializable Float (
            serialize = toString;
            deserialize = fn s => 42.0
        );
        
        # Should work with descriptive parameter name
        serialize 123.45
    `;

	const result = parseAndType(program);
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});

test('trait functions work with creative type parameter names', () => {
	const program = `
      constraint Mashable tuberType (
          mash : tuberType -> String
      );
      
      implement Mashable String (
          mash = fn s => s + " mashed"
      );
      
      # Should work with creative parameter name
      mash "potato"
  `;

	const result = parseAndType(program);

	// Should return String
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});

test('trait functions work with higher-kinded type parameters', () => {
	const program = `
      constraint Mappable m (
          mapit : (a -> b) -> m a -> m b
      );

      implement Mappable (typefn a => List a) (
          mapit = fn f list => list_map f list
      );

      mapit (fn x => x + 1.0) [1.0, 2.0, 3.0]
  `;

	const result = parseAndType(program);

	// Should return List Float
	assertListType(result.type);
	assertPrimitiveType(result.type.element);
	expect(result.type.element.name).toBe('Float');
});

test('trait functions work with multi-word type parameter names', () => {
	const program = `
        constraint Displayable itemType (
            display : itemType -> String
        );
        
        implement Displayable Float (
            display = toString
        );
        
        # Should work with multi-word parameter name
        display 42.5
    `;

	const result = parseAndType(program);

	// Should return String
	assertPrimitiveType(result.type);
	expect(result.type.name).toBe('String');
});

test('concrete variant types are never treated as type parameters', () => {
	const program = `
        constraint Testable a (
            test : a -> Bool
        );
        
        implement Testable Float (
            test = fn x => x > 0.0
        );
        
        # Bool should remain Bool, not be treated as a type parameter
        test 5.0
    `;

	const result = parseAndType(program);

	// Should return Bool (variant type), not some freshened type variable
	assertVariantType(result.type);
	expect(result.type.name).toBe('Bool');
});
