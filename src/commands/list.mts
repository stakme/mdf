import path from "node:path";
import { loadConfig } from "../config.mts";
import { MdfError } from "../errors.mts";
import {
	type MarkdownDocument,
	readMarkdownDocument,
} from "../front-matter.mts";
import type { InvalidFileWarning, LoadedSchema } from "../types.mts";
import {
	compareByTitleAndRoutePath,
	sortSchemaDocuments,
} from "../utils/document-sort.mts";
import { formatErrorMessage } from "../utils/error-message.mts";
import { collectMarkdownFiles, normalizeExtension } from "../utils/files.mts";
import {
	matchesParsedFilter,
	parseFilterExpression,
	resolveFilterPath,
} from "../utils/filters.mts";
import {
	formatDisplayPath,
	formatRelativePath,
} from "../utils/path-format.mts";
import {
	computeVirtualFields,
	splitVirtualPath,
} from "../utils/virtual-fields.mts";
import { buildViewerEntryFromRecord } from "../viewer/meta.mts";

export interface ListCommandOptions {
	cwd: string;
	directory: string;
	virtualPathPrefix?: string;
	filters?: readonly string[];
	format?: string;
	strict?: boolean;
	quiet?: boolean;
}

export interface ListCommandResult {
	lines: string[];
	warnings: InvalidFileWarning[];
}

interface VirtualPathEntry {
	segments: readonly string[];
	label: string;
	order: number;
}

interface ListDocument {
	filePath: string;
	relativePath: string;
	relativeDisplayPath: string;
	displayPath: string;
	fileName: string;
	frontMatter: Record<string, unknown>;
	schema: LoadedSchema;
	segments: string[];
	label: string;
	sortTitle: string;
	routePath: string;
	headings: DocumentHeading[];
}

interface DocumentHeading {
	level: number;
	text: string;
	line: number;
}

interface DirectoryNode {
	type: "dir";
	name: string;
	children: TreeNode[];
	directories: Map<string, DirectoryNode>;
}

interface FileNode {
	type: "file";
	name: string;
	order?: number;
}

type TreeNode = DirectoryNode | FileNode;

export async function runListCommand(
	options: ListCommandOptions,
): Promise<ListCommandResult> {
	const resolvedDirectory = path.resolve(options.cwd, options.directory);
	const config = await loadConfig(options.cwd);
	if (!config) {
		throw new MdfError(
			"CONFIG_NOT_FOUND",
			"Could not find an mdf config file. Create one at .config/mdf.mts",
		);
	}

	const extension = normalizeExtension(config.extension ?? ".md");
	const files = await collectMarkdownFiles(resolvedDirectory, extension);
	if (!files.length) {
		throw new MdfError(
			"NO_MATCHING_FILES",
			`No files with extension ${extension} found in ${resolvedDirectory}`,
		);
	}

	const parsedFilters = (options.filters ?? []).map(parseFilterExpression);
	const prefixSegments = options.virtualPathPrefix
		? splitVirtualPath(options.virtualPathPrefix)
		: undefined;

	const template = options.format;
	const warnings: InvalidFileWarning[] = [];
	const documents: ListDocument[] = [];

	for (const filePath of files) {
		let document: MarkdownDocument;
		try {
			document = await readMarkdownDocument(filePath);
		} catch (error) {
			if (options.strict) {
				throw error;
			}
			warnings.push({
				filePath,
				messages: [formatErrorMessage(error)],
			});
			continue;
		}
		const frontMatter = document.frontMatter;
		const headings = extractHeadings(document.raw);

		if (
			!parsedFilters.every((filter) => matchesParsedFilter(frontMatter, filter))
		) {
			continue;
		}

		const relativePath = path.relative(options.cwd, filePath);
		const schemaEntry = config.getSchemaForRelativePath(relativePath);
		const virtualFields = await computeVirtualFields({
			schema: schemaEntry,
			frontMatter,
			filePath,
			rootDirectory: resolvedDirectory,
			cwd: options.cwd,
		});

		if (
			prefixSegments &&
			!segmentsStartsWith(virtualFields.virtualPathSegments, prefixSegments)
		) {
			continue;
		}

		const displayPath = formatDisplayPath(filePath, options.cwd);
		const relativeDisplayPath = formatRelativePath(filePath, options.cwd);
		const fileName = path.basename(filePath);
		const slug = virtualFields.slug;
		const viewerMeta = buildViewerEntryFromRecord(slug, frontMatter, {
			virtualPath: virtualFields.virtualPath,
		});
		const routePath = slug;
		const sortTitle = viewerMeta.title || fileName;
		const labelBase = sortTitle.length > 0 ? sortTitle : fileName;
		const label = `${labelBase} (${displayPath})`;

		documents.push({
			filePath,
			relativePath,
			relativeDisplayPath,
			displayPath,
			fileName,
			frontMatter,
			schema: schemaEntry,
			segments: [...virtualFields.virtualPathSegments],
			label,
			sortTitle,
			routePath,
			headings,
		});
	}

	const sortedDocuments = sortSchemaDocuments(documents, (a, b) =>
		compareByTitleAndRoutePath(
			{ title: a.sortTitle, routePath: a.routePath },
			{ title: b.sortTitle, routePath: b.routePath },
		),
	);

	if (options.quiet) {
		const lines = sortedDocuments.map((entry) =>
			entry.displayPath.split(path.sep).join(path.posix.sep),
		);
		return { lines, warnings };
	}

	if (template) {
		const lines = sortedDocuments.map((entry) =>
			renderTemplate(template, {
				frontMatter: entry.frontMatter,
				headings: entry.headings,
				paths: {
					absolutePath: entry.filePath,
					displayPath: entry.displayPath,
					filename: entry.fileName,
					relativePath: entry.relativeDisplayPath,
				},
			}),
		);
		return { lines, warnings };
	}

	const entries = sortedDocuments.map((entry, index) => ({
		segments: entry.segments,
		label: entry.label,
		order: index,
	}));
	const tree = buildTree(entries);
	const directoryHeader = formatDisplayPath(resolvedDirectory, options.cwd);
	const lines = tree.length > 0 ? [directoryHeader, ...tree] : tree;
	return { lines, warnings };
}

function buildTree(entries: VirtualPathEntry[]): string[] {
	const root: DirectoryNode = {
		type: "dir",
		name: "",
		children: [],
		directories: new Map(),
	};

	for (const entry of entries) {
		let current = root;
		for (const segment of entry.segments) {
			let next = current.directories.get(segment);
			if (!next) {
				next = {
					type: "dir",
					name: segment,
					children: [],
					directories: new Map(),
				};
				current.directories.set(segment, next);
				current.children.push(next);
			}
			current = next;
		}

		const fileNode: FileNode = {
			type: "file",
			name: entry.label,
			order: entry.order,
		};
		current.children.push(fileNode);
	}

	return formatTree(root);
}

function formatTree(root: DirectoryNode): string[] {
	const lines: string[] = [];
	root.children.forEach((child, index) => {
		appendNode(child, "", index === root.children.length - 1, lines);
	});
	return lines;
}

function appendNode(
	node: TreeNode,
	prefix: string,
	isLast: boolean,
	lines: string[],
): void {
	const connector = isLast ? "└── " : "├── ";
	lines.push(`${prefix}${connector}${node.name}`);

	if (node.type === "dir") {
		const nextPrefix = prefix + (isLast ? "    " : "│   ");
		node.children.forEach((child, index) => {
			appendNode(child, nextPrefix, index === node.children.length - 1, lines);
		});
	}
}

function segmentsStartsWith(
	segments: readonly string[],
	prefix: readonly string[],
): boolean {
	if (prefix.length === 0) {
		return true;
	}

	if (segments.length < prefix.length) {
		return false;
	}

	return prefix.every((segment, index) => segments[index] === segment);
}

interface TemplateContext {
	frontMatter: Record<string, unknown>;
	headings: readonly DocumentHeading[];
	paths: {
		absolutePath: string;
		displayPath: string;
		filename: string;
		relativePath: string;
	};
}

function renderTemplate(template: string, context: TemplateContext): string {
	const pattern = /\{\{\s*([^}]*)\}\}/gu;
	let result = "";
	let cursor = 0;
	let match: RegExpExecArray | null = pattern.exec(template);

	while (match !== null) {
		const matchIndex = match.index ?? 0;
		if (cursor < matchIndex) {
			const literalSegment = template.slice(cursor, matchIndex);
			result += unescapeTemplateLiteral(literalSegment);
		}

		const rawExpression = match[1] ?? "";
		result += renderTemplateExpression(rawExpression, context);
		cursor = pattern.lastIndex ?? matchIndex;
		match = pattern.exec(template);
	}

	if (cursor < template.length) {
		result += unescapeTemplateLiteral(template.slice(cursor));
	}

	return result;
}

function renderTemplateExpression(
	rawExpression: string,
	context: TemplateContext,
): string {
	const { path, separator } = parseTemplateExpression(rawExpression);
	const reservedValue = resolveReservedPath(path, context);
	if (reservedValue !== null) {
		return formatResolvedValue(
			reservedValue.value,
			separator,
			reservedValue.defaultSeparator,
		);
	}

	const value = resolveTemplatePath(context.frontMatter, path);
	if (value === undefined || value === null) {
		return "";
	}

	return formatResolvedValue(value, separator, undefined);
}

interface ReservedPathResolution {
	value: string | string[];
	defaultSeparator?: string;
}

function resolveReservedPath(
	pathExpression: string,
	context: TemplateContext,
): ReservedPathResolution | null {
	const { paths, headings } = context;
	switch (pathExpression) {
		case "file":
			return { value: paths.displayPath };
		case "relpath":
			return { value: paths.relativePath };
		case "abspath":
			return { value: paths.absolutePath };
		case "filename":
			return { value: paths.filename };
		default:
			if (/^h[1-6]$/u.test(pathExpression)) {
				const level = Number.parseInt(pathExpression[1] ?? "", 10);
				return {
					value: selectHeadingsUpToLevel(headings, level),
					defaultSeparator: "\n",
				};
			}
			return null;
	}
}

function formatResolvedValue(
	value: unknown,
	separator: string | null,
	defaultSeparator: string | undefined,
): string {
	if (Array.isArray(value)) {
		const formatted = value
			.map((entry) => formatValue(entry))
			.filter((entry) => entry !== "");
		if (!formatted.length) {
			return "";
		}
		const joiner = separator ?? defaultSeparator ?? ", ";
		return formatted.join(joiner);
	}

	return formatValue(value);
}

function resolveTemplatePath(
	frontMatter: Record<string, unknown>,
	expression: string,
): unknown {
	const segments = expression.split(".");
	if (segments[0] === "f" && segments.length > 1) {
		segments.shift();
	}
	return resolveFilterPath(frontMatter, segments);
}

function parseTemplateExpression(expression: string): {
	path: string;
	separator: string | null;
} {
	const trimmedStart = expression.trimStart();
	const colonIndex = trimmedStart.indexOf(":");
	if (colonIndex === -1) {
		return { path: trimmedStart.trimEnd(), separator: null };
	}
	const path = trimmedStart.slice(0, colonIndex).trimEnd();
	const separator = unescapeTemplateLiteral(trimmedStart.slice(colonIndex + 1));
	return { path, separator };
}

function unescapeTemplateLiteral(segment: string): string {
	let result = "";
	for (let index = 0; index < segment.length; index += 1) {
		const char = segment[index] ?? "";
		if (char !== "\\") {
			result += char;
			continue;
		}

		const next = segment[index + 1];
		if (next === undefined) {
			result += "\\";
			continue;
		}

		switch (next) {
			case "\\":
				result += "\\";
				index += 1;
				break;
			case "n":
				result += "\n";
				index += 1;
				break;
			case "r":
				result += "\r";
				index += 1;
				break;
			case "t":
				result += "\t";
				index += 1;
				break;
			default:
				result += `\\${next}`;
				index += 1;
				break;
		}
	}

	return result;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "bigint") {
		return value.toString();
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

function extractHeadings(content: string): DocumentHeading[] {
	const headings: DocumentHeading[] = [];
	const lines = content.split(/\r?\n/u);
	let inFrontMatter = false;
	let frontMatterProcessed = false;
	let fence: { marker: string; length: number } | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();

		if (!frontMatterProcessed && index === 0 && trimmed === "---") {
			inFrontMatter = true;
			continue;
		}

		if (inFrontMatter) {
			if (trimmed === "---") {
				inFrontMatter = false;
				frontMatterProcessed = true;
			}
			continue;
		}

		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
		if (fenceMatch) {
			const marker = fenceMatch[1] ?? "";
			const markerChar = marker[0];
			if (
				fence &&
				markerChar === fence.marker &&
				marker.length >= fence.length
			) {
				fence = null;
			} else if (!fence) {
				fence = { marker: markerChar ?? "`", length: marker.length };
			}
			continue;
		}

		if (fence) {
			continue;
		}

		const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/u);
		if (!headingMatch) {
			continue;
		}

		const hashes = headingMatch[1] ?? "";
		const rawText = headingMatch[2] ?? "";
		const text = rawText.replace(/\s+#+\s*$/u, "").trim();
		if (!text) {
			continue;
		}

		const level = hashes.length;
		headings.push({
			level,
			text,
			line: index + 1,
		});
	}

	return headings;
}

function selectHeadingsUpToLevel(
	headings: readonly DocumentHeading[],
	level: number,
): string[] {
	if (Number.isNaN(level) || level <= 0) {
		return [];
	}

	return headings
		.filter((heading) => heading.level <= level)
		.map((heading) => formatHeading(heading));
}

function formatHeading(heading: DocumentHeading): string {
	const hashes = "#".repeat(Math.max(1, Math.min(6, heading.level)));
	return `${hashes} ${heading.text} (L:${heading.line})`;
}
