import * as fs from 'node:fs';
import * as path from 'node:path';
import { Lexer } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { Evaluator } from '../src/evaluator/evaluator';
import { typeAndDecorate } from '../src/typer';
import { typeToString } from '../src/typer/helpers';
import { formatValue } from '../src/format';

// MCP (Model Context Protocol) server implementation
// Implements the full protocol: initialize, list tools, call tools

// Safe param helpers (avoid casts/any)
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getStringParam(params: unknown, key: string): string | undefined {
	if (!isRecord(params)) return undefined;
	const value = params[key];
	return typeof value === 'string' ? value : undefined;
}

type JsonRpcRequest = {
	jsonrpc: '2.0';
	id: number | string | null;
	method: string;
	params?: unknown;
};

type JsonRpcSuccess = {
	jsonrpc: '2.0';
	id: number | string | null;
	result: unknown;
};

type JsonRpcError = {
	jsonrpc: '2.0';
	id: number | string | null;
	error: { code: number; message: string; data?: unknown };
};

function ok(id: JsonRpcRequest['id'], result: unknown): JsonRpcSuccess {
	return { jsonrpc: '2.0', id, result };
}

function err(
	id: JsonRpcRequest['id'],
	message: string,
	code = -32000,
	data?: unknown
): JsonRpcError {
	return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// Tool implementations
async function tool_eval(args: { code: string }): Promise<unknown> {
	const code = args?.code;
	if (typeof code !== 'string') throw new Error('Missing argument: code');

	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	const { program: decoratedProgram, state } = typeAndDecorate(program);
	const evaluator = new Evaluator({ traitRegistry: state.traitRegistry });
	const programResult = evaluator.evaluateProgram(decoratedProgram);

	let typeStr = '';
	if (decoratedProgram.statements.length > 0) {
		const last =
			decoratedProgram.statements[decoratedProgram.statements.length - 1];
		if (last.type) {
			typeStr = typeToString(last.type, state.substitution);
		}
	}

	return {
		value: formatValue(programResult.finalResult),
		type: typeStr || null,
	};
}

async function tool_typesOf(args: { code: string }): Promise<unknown> {
	const code = args?.code;
	if (typeof code !== 'string') throw new Error('Missing argument: code');

	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);
	const { program: decoratedProgram, state } = typeAndDecorate(program);

	const types: string[] = decoratedProgram.statements.map(stmt =>
		stmt.type ? typeToString(stmt.type, state.substitution) : 'unknown'
	);

	const lastType =
		decoratedProgram.statements.length > 0 &&
		decoratedProgram.statements.at(-1)!.type
			? typeToString(
					decoratedProgram.statements.at(-1)!.type!,
					state.substitution
				)
			: null;

	return { types, lastType };
}

async function tool_runFile(args: { path: string }): Promise<unknown> {
	const filePath = args?.path;
	if (typeof filePath !== 'string') throw new Error('Missing argument: path');

	const fullPath = path.resolve(filePath);
	const code = fs.readFileSync(fullPath, 'utf8');

	const lexer = new Lexer(code);
	const tokens = lexer.tokenize();
	const program = parse(tokens);

	const { program: decoratedProgram, state } = typeAndDecorate(program);
	const evaluator = new Evaluator({ traitRegistry: state.traitRegistry });
	const programResult = evaluator.evaluateProgram(decoratedProgram);

	let typeStr = '';
	if (decoratedProgram.statements.length > 0) {
		const last =
			decoratedProgram.statements[decoratedProgram.statements.length - 1];
		if (last.type) {
			typeStr = typeToString(last.type, state.substitution);
		}
	}

	return {
		file: fullPath,
		value: formatValue(programResult.finalResult),
		type: typeStr || null,
	};
}

const tools = [
	{
		name: 'noolang_eval',
		description: 'Evaluate a Noolang expression and return value and type',
		inputSchema: {
			type: 'object',
			required: ['code'],
			properties: {
				code: {
					type: 'string',
					description: 'Noolang code to evaluate',
				},
			},
		},
		handler: tool_eval,
	},
	{
		name: 'noolang_typesOf',
		description: 'Infer types for each statement and the final expression',
		inputSchema: {
			type: 'object',
			required: ['code'],
			properties: {
				code: {
					type: 'string',
					description: 'Noolang code to type check',
				},
			},
		},
		handler: tool_typesOf,
	},
	{
		name: 'noolang_runFile',
		description:
			'Run a Noolang program file and return the final value and type',
		inputSchema: {
			type: 'object',
			required: ['path'],
			properties: {
				path: {
					type: 'string',
					description: 'Path to the .noo file to run',
				},
			},
		},
		handler: tool_runFile,
	},
] as const;

// JSON-RPC message handling
process.stdin.setEncoding('utf8');
let buffer = '';

// Write debug info to stderr so it doesn't interfere with protocol
function debug(msg: string) {
	process.stderr.write(`[MCP Debug] ${msg}\n`);
}

// Log startup
debug('Noolang MCP server started, waiting for messages...');

process.stdin.on('data', chunk => {
	buffer += chunk;
	while (true) {
		const newlineIndex = buffer.indexOf('\n');
		if (newlineIndex === -1) break;

		const line = buffer.slice(0, newlineIndex);
		buffer = buffer.slice(newlineIndex + 1);

		if (!line.trim()) continue;

		// Log raw incoming message
		debug(`Raw message: ${line}`);

		let request: JsonRpcRequest;
		try {
			request = JSON.parse(line);
			debug(
				`Received: ${request.method} with params: ${JSON.stringify(request.params || {})}`
			);
		} catch (e) {
			const response = err(
				null,
				`Invalid JSON: ${(e as Error).message}`,
				-32700
			);
			process.stdout.write(JSON.stringify(response) + '\n');
			continue;
		}

		handleRequest(request).then(response => {
			// Don't send response for notifications (requests without id)
			if (request.id !== undefined && request.id !== null) {
				debug(`Sending response for ${request.method}`);
				process.stdout.write(JSON.stringify(response) + '\n');
			}
		});
	}
});

async function handleRequest(
	req: JsonRpcRequest
): Promise<JsonRpcSuccess | JsonRpcError> {
	try {
		switch (req.method) {
			case 'initialize':
				return ok(req.id, {
					protocolVersion: '2024-11-05',
					capabilities: {
						tools: {
							listChanged: false,
						},
						prompts: {
							listChanged: false,
						},
						resources: {
							subscribe: false,
							listChanged: false,
						},
					},
					serverInfo: {
						name: 'noolang-mcp',
						version: '1.0.0',
					},
				});

			case 'initialized':
				// This is a notification, no response needed
				debug('Server initialized');
				return ok(null, {});

			case 'tools/list': {
				const toolsList = tools.map(t => ({
					name: t.name,
					description: t.description,
					inputSchema: t.inputSchema,
				}));
				debug(
					`Returning ${toolsList.length} tools: ${toolsList.map(t => t.name).join(', ')}`
				);
				return ok(req.id, {
					tools: toolsList,
				});
			}

			case 'prompts/list':
				// We don't have any prompts, return empty list
				debug('Returning empty prompts list');
				return ok(req.id, {
					prompts: [],
				});

			case 'resources/list':
				debug('Returning resources list');
				return ok(req.id, {
					resources: [
						{
							uri: 'noolang://docs/language-reference.md',
							name: 'Language Reference',
							description: 'Complete Noolang language reference',
							mimeType: 'text/markdown',
						},
						{
							uri: 'noolang://stdlib.noo',
							name: 'Standard Library',
							description: 'Noolang standard library source',
							mimeType: 'text/plain',
						},
						{
							uri: 'noolang://llms.txt',
							name: 'LLM Guide',
							description: 'Guide for LLMs working with Noolang',
							mimeType: 'text/plain',
						},
					],
				});

			case 'resources/read': {
				const uri = getStringParam(req.params, 'uri');
				debug(`Reading resource: ${uri}`);

				if (!uri) {
					return err(req.id, 'Missing or invalid uri parameter', -32602);
				}

				try {
					let content: string;
					let mimeType: string;

					if (uri === 'noolang://docs/language-reference.md') {
						content = fs.readFileSync(
							path.join(__dirname, '..', 'docs', 'language-reference.md'),
							'utf8'
						);
						mimeType = 'text/markdown';
					} else if (uri === 'noolang://stdlib.noo') {
						content = fs.readFileSync(
							path.join(__dirname, '..', 'stdlib.noo'),
							'utf8'
						);
						mimeType = 'text/plain';
					} else if (uri === 'noolang://llms.txt') {
						content = fs.readFileSync(
							path.join(__dirname, '..', 'llms.txt'),
							'utf8'
						);
						mimeType = 'text/plain';
					} else {
						return err(req.id, `Unknown resource: ${uri}`, -32602);
					}

					return ok(req.id, {
						contents: [
							{
								uri,
								mimeType,
								text: content,
							},
						],
					});
				} catch (e: any) {
					return err(req.id, `Failed to read resource: ${e.message}`, -32000);
				}
			}
			case 'tools/call': {
				const name = getStringParam(req.params, 'name');
				if (!name) {
					return err(req.id, 'Missing tool name', -32602);
				}

				// Extract arguments object if present, otherwise use empty object
				const args =
					isRecord(req.params) && isRecord(req.params['arguments'])
						? (req.params['arguments'] as Record<string, unknown>)
						: {};

				try {
					if (name === 'noolang_eval') {
						const code = getStringParam(args, 'code');
						if (!code) return err(req.id, 'Missing argument: code', -32602);
						const result = await tool_eval({ code });
						return ok(req.id, {
							content: [
								{ type: 'text', text: JSON.stringify(result, null, 2) },
							],
						});
					}
					if (name === 'noolang_typesOf') {
						const code = getStringParam(args, 'code');
						if (!code) return err(req.id, 'Missing argument: code', -32602);
						const result = await tool_typesOf({ code });
						return ok(req.id, {
							content: [
								{ type: 'text', text: JSON.stringify(result, null, 2) },
							],
						});
					}
					if (name === 'noolang_runFile') {
						const filePath = getStringParam(args, 'path');
						if (!filePath) return err(req.id, 'Missing argument: path', -32602);
						const result = await tool_runFile({ path: filePath });
						return ok(req.id, {
							content: [
								{ type: 'text', text: JSON.stringify(result, null, 2) },
							],
						});
					}

					return err(req.id, `Unknown tool: ${name}`, -32602);
				} catch (e: any) {
					return ok(req.id, {
						content: [
							{ type: 'text', text: `Error: ${e.message || String(e)}` },
						],
						isError: true,
					});
				}
			}

			default:
				return err(req.id, `Unknown method: ${req.method}`, -32601);
		}
	} catch (e: any) {
		return err(req.id, e?.message ?? String(e), -32000);
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	debug('Shutting down');
	process.exit(0);
});

process.on('SIGTERM', () => {
	debug('Shutting down');
	process.exit(0);
});
