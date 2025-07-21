module.exports = {
	semi: true,
	trailingComma: 'es5',
	singleQuote: true,
	printWidth: 80,
	tabWidth: 2,
	useTabs: true,
	bracketSpacing: true,
	arrowParens: 'avoid',
	endOfLine: 'lf',
	overrides: [
		{
			files: '*.json',
			options: {
				useTabs: false,
			},
		},
	],
};
