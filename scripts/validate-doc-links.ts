#!/usr/bin/env bun

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface BrokenLink {
	file: string;
	line: number;
	target: string;
}

const externalTarget = /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i;
const inlineLink = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g;
const referenceDefinition = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/;
const htmlLink = /\b(?:href|src)=["']([^"']+)["']/gi;

function localTargets(
	markdown: string
): Array<{ line: number; target: string }> {
	const targets: Array<{ line: number; target: string }> = [];
	let fenced = false;

	for (const [index, originalLine] of markdown.split(/\r?\n/).entries()) {
		if (/^\s*(```|~~~)/.test(originalLine)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;

		const line = originalLine.replace(/`[^`]*`/g, '');
		const definition = line.match(referenceDefinition);
		if (definition) targets.push({ line: index + 1, target: definition[1] });

		for (const match of line.matchAll(inlineLink)) {
			targets.push({ line: index + 1, target: match[1] });
		}
		for (const match of line.matchAll(htmlLink)) {
			targets.push({ line: index + 1, target: match[1] });
		}
	}

	return targets;
}

function targetPath(
	root: string,
	file: string,
	rawTarget: string
): { path: string; outsideRoot: boolean } | undefined {
	const target = rawTarget.replace(/^<|>$/g, '').split(/[?#]/, 1)[0];
	if (!target || externalTarget.test(target)) return undefined;

	let decoded: string;
	try {
		decoded = decodeURIComponent(target);
	} catch {
		decoded = target;
	}

	const candidate = decoded.startsWith('/')
		? resolve(root, decoded.slice(1))
		: resolve(root, dirname(file), decoded);
	const fromRoot = relative(root, candidate);
	return {
		path: candidate,
		outsideRoot: fromRoot.startsWith('..') || isAbsolute(fromRoot),
	};
}

export function findBrokenLinks(root: string, files: string[]): BrokenLink[] {
	return files.flatMap(file =>
		localTargets(readFileSync(resolve(root, file), 'utf8')).flatMap(
			({ line, target }) => {
				const candidate = targetPath(root, file, target);
				return candidate &&
					(candidate.outsideRoot || !existsSync(candidate.path))
					? [{ file, line, target }]
					: [];
			}
		)
	);
}

function trackedDocumentationFiles(root: string): string[] {
	const result = spawnSync('git', ['ls-files', '--', '*.md', 'llms.txt'], {
		cwd: root,
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		throw new Error(
			result.stderr.trim() || 'Could not list tracked documentation files'
		);
	}
	return result.stdout.trim().split('\n').filter(Boolean);
}

if (require.main === module) {
	const root = resolve(__dirname, '..');
	const files = trackedDocumentationFiles(root);
	const broken = findBrokenLinks(root, files);

	if (broken.length > 0) {
		process.stderr.write(
			`Found ${broken.length} broken local documentation link(s):\n`
		);
		for (const { file, line, target } of broken) {
			process.stderr.write(`  ${file}:${line} -> ${target}\n`);
		}
		process.exit(1);
	}

	process.stdout.write(
		`Validated local links in ${files.length} documentation files.\n`
	);
}
