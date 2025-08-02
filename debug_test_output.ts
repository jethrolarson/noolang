import { parseAndType } from './test/utils';
import { typeToString } from './src/typer/helpers';

console.log('=== Debug test outputs ===');

// Test map @name
const result1 = parseAndType('map @name');
const typeStr1 = typeToString(result1.type, result1.state.substitution);
console.log('map @name:', typeStr1);

// Test constraint ordering
const implementsIndex = typeStr1.indexOf('implements');
const hasIndex = typeStr1.indexOf('has');
console.log(`Constraint order: implements at ${implementsIndex}, has at ${hasIndex}`);

// Test map id  
const result2 = parseAndType('map id');
const typeStr2 = typeToString(result2.type, result2.state.substitution);
console.log('map id:', typeStr2);