import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { Lexer } from '../../../src/lexer/lexer';
import { parse } from '../../../src/parser/parser';
import { typeAndDecorate } from '../../../src/typer';
import { Evaluator, Value } from '../../../src/evaluator/evaluator';

function unwrapValue(val: Value): any {
    if (val === null) return null;
    if (typeof val !== 'object') return val;
    switch (val.tag) {
        case 'number':
            return val.value;
        case 'string':
            return val.value;
        case 'constructor':
            if (val.name === 'True') return true;
            if (val.name === 'False') return false;
            return val;
        case 'list':
            return val.values.map(unwrapValue);
        case 'tuple':
            return val.values.map(unwrapValue);
        case 'record': {
            const obj: any = {};
            for (const k in val.fields) obj[k] = unwrapValue(val.fields[k]);
            return obj;
        }
        default:
            return val;
    }
}

function runCode(code: string) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    const decoratedResult = typeAndDecorate(ast);
    const evaluator = new Evaluator({ traitRegistry: decoratedResult.state.traitRegistry });
    return evaluator.evaluateProgram(decoratedResult.program);
}

function expectSuccess(code: string, expectedValue?: any) {
    const result = runCode(code);
    if (expectedValue !== undefined) {
        assert.equal(unwrapValue(result.finalResult), expectedValue);
    }
    return result;
}

function expectError(code: string) {
    assert.throws(() => runCode(code));
}

// Test the specific list_map toString issue
test('direct list_map toString usage works', () => {
    expectSuccess(`
        result = list_map toString [1, 2, 3];
        result
    `, ["1", "2", "3"]);
});

test('list_map with custom function works', () => {
    expectSuccess(`
        double = fn x => x * 2;
        result = list_map double [1, 2, 3];
        result
    `, [2, 4, 6]);
});

test('toString function works individually', () => {
    expectSuccess(`
        result = toString 42;
        result
    `, "42");
});

test('| operator with list_map and custom function', () => {
    expectSuccess(`
        double = fn x => x * 2;
        result = [1, 2, 3] | list_map double;
        result
    `, [2, 4, 6]);
});

test('| operator with list_map toString - now working!', () => {
    // This now works after fixing list_map to accept native functions
    expectSuccess(`
        result = [1, 2, 3] | list_map toString;
        result
    `, ["1", "2", "3"]);
});

test('investigate why toString fails through |', () => {
    // Let's see if we can understand the issue
    expectSuccess(`
        # Try different approaches
        numbers = [1, 2, 3];
        # This works:
        result1 = list_map toString numbers;
        # This fails:
        # result2 = numbers | list_map toString;
        result1
    `, ["1", "2", "3"]);
});

test('compare | vs direct application with toString', () => {
    expectSuccess(`
        # Direct application works
        result = list_map toString [1, 2, 3];
        result
    `, ["1", "2", "3"]);
});

test('investigate if issue is with | and built-in functions', () => {
    expectSuccess(`
        # Try with other built-in functions
        result = [1, 2, 3] | length;
        result
    `, 3);
});

test.run();