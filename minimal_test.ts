import { parseAndType } from './test/utils';

// Test the simplest case: just map
const mapResult = parseAndType('map');
console.log('Map type:', JSON.stringify(mapResult.type, null, 2));

// Test map with one argument
const mapWithFuncResult = parseAndType('map (fn x => x + 1)');
console.log('Map with function type:', JSON.stringify(mapWithFuncResult.type, null, 2)); 