import path from "node:path";
import { loadConfig } from "../config.mts";
import { MdfError } from "../errors.mts";
import {
	type MarkdownDocument,
	readMarkdownDocument,
} from "../front-matter.mts";
import type { InvalidFileWarning, LoadedSchema } from "../types.mts";
import { sortSchemaDocuments } from "../utils/document-sort.mts";
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

export interface ListCommandOptions {
	cwd: string;
	directory: string;
	virtualPathPrefix?: string;
	filters?: readonly string[];
	format?: string;
	strict?: boolean;
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

	const needsVirtualPath =
		!options.format || Boolean(options.virtualPathPrefix);
	const virtualPathConfig = config.virtualPath;

	if (needsVirtualPath && !virtualPathConfig) {
		throw new MdfError(
			"VIRTUAL_PATH_NOT_CONFIGURED",
			`Virtual path configuration not found in ${formatDisplayPath(config.path, options.cwd)}. Define virtualPath.param in the config file.`,
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
	const prefixSegments =
		options.virtualPathPrefix && virtualPathConfig
			? splitVirtualPath(
					options.virtualPathPrefix,
					virtualPathConfig.separator ?? "/",
				)
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

		if (
			!parsedFilters.every((filter) => matchesParsedFilter(frontMatter, filter))
		) {
			continue;
		}

		let segments: string[] = [];
		if (virtualPathConfig) {
			const rawVirtualPath = frontMatter[virtualPathConfig.param];

			if (rawVirtualPath === undefined || rawVirtualPath === null) {
				segments = [];
			} else if (typeof rawVirtualPath === "string") {
				segments = splitVirtualPath(
					rawVirtualPath,
					virtualPathConfig.separator ?? "/",
				);
			} else {
				throw new MdfError(
					"INVALID_VIRTUAL_PATH_VALUE",
					`Front matter field "${virtualPathConfig.param}" must be a string in ${formatDisplayPath(filePath, options.cwd)}`,
				);
			}

			if (prefixSegments && !segmentsStartsWith(segments, prefixSegments)) {
				continue;
			}
		}

		const relativePath = path.relative(options.cwd, filePath);
		const schemaEntry = config.getSchemaForRelativePath(relativePath);
		const displayPath = formatDisplayPath(filePath, options.cwd);
		const relativeDisplayPath = formatRelativePath(filePath, options.cwd);
		const fileName = path.basename(filePath);
		const titleValue = frontMatter.title;
		const title = typeof titleValue === "string" ? titleValue.trim() : "";
		const labelBase = title.length > 0 ? title : fileName;
		const label = `${labelBase} (${displayPath})`;

		documents.push({
			filePath,
			relativePath,
			relativeDisplayPath,
			displayPath,
			fileName,
			frontMatter,
			schema: schemaEntry,
			segments,
			label,
		});
	}

	const sortedDocuments = sortSchemaDocuments(documents, (a, b) =>
		a.relativePath.localeCompare(b.relativePath, undefined, {
			sensitivity: "base",
		}),
	);

	if (template) {
		const lines = sortedDocuments.map((entry) =>
			renderTemplate(template, {
				frontMatter: entry.frontMatter,
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
	return { lines: tree, warnings };
}

function splitVirtualPath(value: string, separator: string): string[] {
	const normalized = value.trim();
	if (!normalized) {
		return [];
	}

	return normalized
		.split(separator)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
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
	const children = sortNodes(root.children);
	children.forEach((child, index) => {
		appendNode(child, "", index === children.length - 1, lines);
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
		const children = sortNodes(node.children);
		children.forEach((child, index) => {
			appendNode(child, nextPrefix, index === children.length - 1, lines);
		});
	}
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
	return [...nodes].sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "dir" ? -1 : 1;
		}

		if (a.type === "file" && b.type === "file") {
			const orderA = a.order;
			const orderB = b.order;
			if (orderA !== undefined || orderB !== undefined) {
				if (orderA === undefined) {
					return 1;
				}
				if (orderB === undefined) {
					return -1;
				}
				if (orderA !== orderB) {
					return orderA - orderB;
				}
			}
		}

		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});
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

function renderTemplate(
	template: string,
	context: {
		frontMatter: Record<string, unknown>;
		paths: {
			absolutePath: string;
			displayPath: string;
			filename: string;
			relativePath: string;
		};
	},
): string {
	return template.replace(
		/\{\{\s*([^}]*)\}\}/gu,
		(_, rawExpression: string) => {
			const { path, separator } = parseTemplateExpression(rawExpression);
			const reservedValue = resolveReservedPath(path, context.paths);
			if (reservedValue !== null) {
				return reservedValue;
			}

			const value = resolveTemplatePath(context.frontMatter, path);
			if (value === undefined || value === null) {
				return "";
			}

			if (Array.isArray(value)) {
				const formatted = value
					.map(formatValue)
					.filter((entry) => entry !== "");
				if (!formatted.length) {
					return "";
				}
				return formatted.join(separator ?? ", ");
			}

			return formatValue(value);
		},
	);
}

function resolveReservedPath(
	pathExpression: string,
	paths: {
		absolutePath: string;
		displayPath: string;
		filename: string;
		relativePath: string;
	},
): string | null {
	switch (pathExpression) {
		case "file":
			return paths.displayPath;
		case "relpath":
			return paths.relativePath;
		case "abspath":
			return paths.absolutePath;
		case "filename":
			return paths.filename;
		default:
			return null;
	}
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
	const separator = trimmedStart.slice(colonIndex + 1);
	return { path, separator };
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
