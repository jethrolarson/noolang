import { Lexer } from '../../src/lexer/lexer';
import { parse } from '../../src/parser/parser';
import { typeAndDecorate } from '../../src/typer';
import { Evaluator, Value } from '../../src/evaluator/evaluator';

/**
 * Shared utilities for operator testing
 */

export function unwrapValue(val: Value): any {
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

export function runCode(code: string) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const ast = parse(tokens);
    const decoratedResult = typeAndDecorate(ast);
    const evaluator = new Evaluator({ traitRegistry: decoratedResult.state.traitRegistry });
    return evaluator.evaluateProgram(decoratedResult.program);
}

export function expectError(code: string, errorPattern?: string) {
    try {
        runCode(code);
        throw new Error('Expected error but code succeeded');
    } catch (error) {
        if (errorPattern && !error.message.match(new RegExp(errorPattern, 'i'))) {
            throw new Error(`Expected error matching "${errorPattern}" but got: ${error.message}`);
        }
        // Test framework expects this to throw, so we don't catch it
        throw error;
    }
}

export function expectSuccess(code: string, expectedValue?: any) {
    const result = runCode(code);
    if (expectedValue !== undefined) {
        const actualValue = unwrapValue(result.finalResult);
        if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
            throw new Error(`Expected ${JSON.stringify(expectedValue)} but got ${JSON.stringify(actualValue)}`);
        }
    }
    return result;
}