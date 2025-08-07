import * as fs from 'node:fs';
import * as path from 'node:path';
import { Lexer } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { Evaluator } from '../src/evaluator/evaluator';
import { typeAndDecorate } from '../src/typer';
import { typeToString } from '../src/typer/helpers';
import { formatValue } from '../src/format';

// Minimal JSON-RPC 2.0 over newline-delimited JSON
// Supported methods:
// - tools/list
// - tools/call { name: string, arguments: object }

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: any;
};

type JsonRpcSuccess = {
  jsonrpc: '2.0';
  id: number | string | null;
  result: any;
};

type JsonRpcError = {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: any };
};

function ok(id: JsonRpcRequest['id'], result: any): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

function err(id: JsonRpcRequest['id'], message: string, code = -32000, data?: any): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// Tool implementations
async function tool_eval(args: { code: string }): Promise<any> {
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
    const last = decoratedProgram.statements[decoratedProgram.statements.length - 1];
    if ((last as any).type) {
      typeStr = typeToString((last as any).type, state.substitution);
    }
  }

  return {
    value: formatValue(programResult.finalResult),
    type: typeStr || null,
  };
}

async function tool_typesOf(args: { code: string }): Promise<any> {
  const code = args?.code;
  if (typeof code !== 'string') throw new Error('Missing argument: code');

  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const program = parse(tokens);
  const { program: decoratedProgram, state } = typeAndDecorate(program);

  const types: string[] = decoratedProgram.statements.map(stmt =>
    (stmt as any).type ? typeToString((stmt as any).type, state.substitution) : 'unknown'
  );

  const lastType =
    decoratedProgram.statements.length > 0 && (decoratedProgram.statements.at(-1) as any).type
      ? typeToString((decoratedProgram.statements.at(-1) as any).type, state.substitution)
      : null;

  return { types, lastType };
}

async function tool_runFile(args: { path: string }): Promise<any> {
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
    const last = decoratedProgram.statements[decoratedProgram.statements.length - 1];
    if ((last as any).type) {
      typeStr = typeToString((last as any).type, state.substitution);
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
    name: 'noolang.eval',
    description: 'Evaluate a Noolang expression and return value and type',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string' } },
    },
    handler: tool_eval,
  },
  {
    name: 'noolang.typesOf',
    description: 'Infer types for each statement and the final expression',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string' } },
    },
    handler: tool_typesOf,
  },
  {
    name: 'noolang.runFile',
    description: 'Run a Noolang program file and return the final value and type',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: { path: { type: 'string' } },
    },
    handler: tool_runFile,
  },
] as const;

type Tool = (typeof tools)[number];

function listTools() {
  return {
    tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  };
}

async function callTool(name: string, args: any) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return await tool.handler(args);
}

// JSON-RPC loop (newline-delimited)
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk;
  for (;;) {
    const idx = buffer.indexOf('\n');
    if (idx === -1) break;
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line);
    } catch (e) {
      process.stdout.write(
        JSON.stringify(err(null, `Invalid JSON: ${(e as Error).message}`, -32700)) + '\n'
      );
      continue;
    }

    handleRequest(req).then(res => {
      process.stdout.write(JSON.stringify(res) + '\n');
    });
  }
});

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcSuccess | JsonRpcError> {
  try {
    if (req.jsonrpc !== '2.0') return err(req.id, 'Invalid JSON-RPC version', -32600);
    if (req.method === 'tools/list') {
      return ok(req.id, listTools());
    }
    if (req.method === 'tools/call') {
      const name = req?.params?.name;
      const args = req?.params?.arguments ?? {};
      if (typeof name !== 'string') return err(req.id, 'Missing tool name', -32602);
      const result = await callTool(name, args);
      return ok(req.id, { ok: true, content: result });
    }
    return err(req.id, `Unknown method: ${req.method}`, -32601);
  } catch (e: any) {
    return err(req.id, e?.message ?? String(e));
  }
}