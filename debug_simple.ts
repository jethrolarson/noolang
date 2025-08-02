import { parseAndType } from './test/utils';

console.log('=== Investigation: Why function composition fails ===');

// Step 1: What does the composed function type look like?
console.log('\n1. Composed function type:');
const composedFunc = parseAndType(`
	getAddress = @address;
	getStreet = @street;
	getFullAddress = fn person => getStreet (getAddress person)
`);
console.log('getFullAddress type:', JSON.stringify(composedFunc.type, null, 2));

// Step 2: What happens when we apply getAddress inside the function?
console.log('\n2. Step by step inside function:');
console.log('getAddress applied to person should return address record...');

// Step 3: What happens when we apply getStreet to that result?
console.log('\n3. Chain of applications:');

// Step 4: What does direct manual composition look like?
console.log('\n4. Direct manual composition (not in function):');
const directComp = parseAndType(`
	getAddress = @address;
	getStreet = @street;
	person = {@address {@street "123 Main St", @city "NYC"}, @name "Alice"};
	addressRecord = getAddress person;
	result = getStreet addressRecord
`);
console.log('Direct composition result:', JSON.stringify(directComp.type, null, 2));

// Step 5: Compare with problematic version
console.log('\n5. Problematic function application:');
const problematic = parseAndType(`
	getAddress = @address;
	getStreet = @street;
	getFullAddress = fn person => getStreet (getAddress person);
	getFullAddress {@address {@street "123 Main St", @city "NYC"}, @name "Alice"}
`);
console.log('Problematic result:', JSON.stringify(problematic.type, null, 2));