import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { typeProgram } from '../index';
import { Lexer } from '../../lexer/lexer';
import { parse } from '../../parser/parser';

// Helper function to parse and type check a string
const typeString = (input: string) => {
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    return typeProgram(ast);
};

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
    
    const result = typeString(program);
    
    // Should return String
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'String');
});

test('trait functions work with uppercase type parameter names', () => {
    const program = `
        constraint Container ContainerType (
            empty : ContainerType a;
            insert : a -> ContainerType a -> ContainerType a
        );
        
        implement Container List (
            empty = [];
            insert = fn x list => cons x list
        );
        
        # Should work with uppercase parameter name
        empty
    `;
    
    const result = typeString(program);
    
    // Should return a constrained type with variant baseType (ContainerType a)
    assert.equal(result.type.kind, 'constrained');
    assert.equal(result.type.baseType.kind, 'variant');
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
    
    const result = typeString(program);
    
    // Should return String
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'String');
});

test('trait functions work with single uppercase letter (breaking the convention)', () => {
    const program = `
        constraint Mappable M (
            map : (a -> b) -> M a -> M b
        );
        
        implement Mappable List (
            map = fn f list => list_map f list
        );
        
        # Should work even though we use uppercase M instead of lowercase f
        map (fn x => x + 1.0) [1.0, 2.0, 3.0]
    `;
    
    const result = typeString(program);
    
    // Should return List Float
    assert.equal(result.type.kind, 'list');
    assert.equal(result.type.element.kind, 'primitive');
    assert.equal(result.type.element.name, 'Float');
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
    
    const result = typeString(program);
    
    // Should return String
    assert.equal(result.type.kind, 'primitive');
    assert.equal(result.type.name, 'String');
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
    
    const result = typeString(program);
    
    // Should return Bool (variant type), not some freshened type variable
    assert.equal(result.type.kind, 'variant');
    assert.equal(result.type.name, 'Bool');
});

test.run();