import type { AddressInfo } from "node:net";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import { marked } from "marked";
import { loadConfig } from "../config.mts";
import { MdfError } from "../errors.mts";
import { readMarkdownDocument } from "../front-matter.mts";
import { collectMarkdownFiles, normalizeExtension } from "../utils/files.mts";
import {
	matchesParsedFilter,
	type ParsedFilter,
	parseFilterExpression,
} from "../utils/filters.mts";
import {
	formatDisplayPath,
	formatRelativePath,
} from "../utils/path-format.mts";
import {
	buildViewerEntryFromRecord,
	type ViewerMeta,
} from "../viewer/meta.mts";

export interface ViewerCommandOptions {
	cwd: string;
	directory: string;
	filters?: readonly string[];
	virtualPathPrefix?: string;
	port?: number;
	host?: string;
}

export interface ViewerDocument {
	id: string;
	filePath: string;
	displayPath: string;
	relativePath: string;
	slug: string;
	meta: ViewerMeta;
	frontMatter: Record<string, unknown>;
	html: string;
	markdown: string;
	virtualPathSegments: string[];
	navigationSegments: string[];
}

export interface ViewerContext {
	cwd: string;
	directory: string;
	directoryLabel: string;
	documents: ViewerDocument[];
	documentMap: Map<string, ViewerDocument>;
	navigation: ViewerNavigationDirectory;
	defaultDocument: ViewerDocument;
	virtualPathParam: string;
	virtualPathSeparator: string;
}

export interface ViewerNavigationDirectory {
	type: "dir";
	name: string;
	children: ViewerNavigationNode[];
}

export interface ViewerNavigationFile {
	type: "file";
	name: string;
	documentId: string;
	routePath: string;
}

export type ViewerNavigationNode =
	| ViewerNavigationDirectory
	| ViewerNavigationFile;

interface PrepareViewerContextOptions extends ViewerCommandOptions {}

interface MutableDirectoryNode {
	type: "dir";
	name: string;
	children: (MutableDirectoryNode | ViewerNavigationFile)[];
	directories: Map<string, MutableDirectoryNode>;
}

export async function runViewerCommand(
	options: ViewerCommandOptions,
): Promise<void> {
	const context = await prepareViewerContext(options);
	const app = createViewerApp(context);
	const port = options.port ?? 4173;
	const hostname = options.host ?? "127.0.0.1";

	const server = serve(
		{ fetch: app.fetch, port, hostname },
		(info: AddressInfo) => {
			const hostLabel = formatAddress(info);
			console.log(`Viewer running at http://${hostLabel}`);
		},
	);

	await waitForShutdown(server);
}

export async function prepareViewerContext(
	options: PrepareViewerContextOptions,
): Promise<ViewerContext> {
	const resolvedDirectory = path.resolve(options.cwd, options.directory);
	const config = await loadConfig(options.cwd);
	if (!config) {
		throw new MdfError(
			"CONFIG_NOT_FOUND",
			"Could not find an mdf config file. Create one at .config/mdf.mts",
		);
	}

	const virtualPathConfig = config.virtualPath;
	if (!virtualPathConfig) {
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
	const separator = virtualPathConfig.separator ?? "/";
	const prefixSegments = options.virtualPathPrefix?.length
		? splitVirtualPathInput(options.virtualPathPrefix, separator)
		: undefined;

	const documents: ViewerDocument[] = [];
	for (const filePath of files) {
		const document = await readMarkdownDocument(filePath);
		const frontMatter = document.frontMatter;

		if (!matchesAllFilters(frontMatter, parsedFilters)) {
			continue;
		}

		const { rawVirtualPath, segments } = extractVirtualPath(
			frontMatter,
			virtualPathConfig.param,
			separator,
			filePath,
			options.cwd,
		);

		if (prefixSegments && !segmentsStartsWith(segments, prefixSegments)) {
			continue;
		}

		const relativePath = formatRelativePath(filePath, options.cwd);
		const slug = createSlug(relativePath);
		const meta = buildViewerEntryFromRecord(slug, frontMatter, {
			virtualPathField: virtualPathConfig.param,
			virtualPathSeparator: separator,
		});

		const rendered = marked.parse(document.body);
		const html = typeof rendered === "string" ? rendered : String(rendered);
		const id = encodeDocumentId(relativePath);
		const navigationSegments = segments.length
			? [...segments]
			: slugSegments(meta.routePath);

		documents.push({
			id,
			filePath,
			displayPath: formatDisplayPath(filePath, options.cwd),
			relativePath,
			slug,
			meta: {
				...meta,
				virtualPath: rawVirtualPath ?? meta.virtualPath,
			},
			frontMatter,
			html,
			markdown: document.body,
			virtualPathSegments: segments,
			navigationSegments,
		});
	}

	if (!documents.length) {
		throw new MdfError(
			"VIEWER_NO_DOCUMENTS",
			"No documents matched the current viewer filters",
		);
	}

	documents.sort((a, b) =>
		a.meta.routePath.localeCompare(b.meta.routePath, undefined, {
			sensitivity: "base",
		}),
	);

	const navigation = buildNavigation(documents);
	const documentMap = new Map(documents.map((doc) => [doc.id, doc]));
	const defaultDocument = documents[0];

	return {
		cwd: options.cwd,
		directory: resolvedDirectory,
		directoryLabel: formatDisplayPath(resolvedDirectory, options.cwd),
		documents,
		documentMap,
		navigation,
		defaultDocument,
		virtualPathParam: virtualPathConfig.param,
		virtualPathSeparator: separator,
	};
}

export function createViewerApp(context: ViewerContext): Hono {
	const app = new Hono();

	app.get("/", (c) => {
		const requestedId = c.req.query("doc");
		const document = requestedId
			? (context.documentMap.get(requestedId) ?? context.defaultDocument)
			: context.defaultDocument;
		return c.html(renderViewerHtml(context, document));
	});

	app.get("/documents/:id", (c) => {
		const document = context.documentMap.get(c.req.param("id"));
		if (!document) {
			return c.json({ error: "Not Found" }, 404);
		}
		return c.json({
			id: document.id,
			title: document.meta.title,
			description: document.meta.description,
			tags: document.meta.tags,
			author: document.meta.author,
			createdAt: document.meta.createdAt,
			updatedAt: document.meta.updatedAt,
			frontMatter: document.frontMatter,
			displayPath: document.displayPath,
			relativePath: document.relativePath,
			routePath: document.meta.routePath,
			html: document.html,
		});
	});

	return app;
}

export function renderViewerHtml(
	context: ViewerContext,
	document: ViewerDocument,
): string {
	const title = `${document.meta.title} – mdf viewer`;
	const navigationHtml = renderNavigation(context.navigation, document.id);
	const mobileSelector = renderMobileSelector(context, document.id);
	const descriptionHtml = document.meta.description
		? `<p class="text-base text-muted-foreground">${escapeHtml(document.meta.description)}</p>`
		: "";

	return `<!DOCTYPE html>
<html lang="en" class="dark" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(title)}</title>
<script src="https://cdn.tailwindcss.com?plugins=typography"></script>
<link rel="stylesheet" href="https://ui.shadcn.com/themes/v0/default.css" />
</head>
<body class="min-h-screen bg-background text-foreground">
<div class="flex min-h-screen flex-col">
	<header class="border-b border-border bg-card/60 backdrop-blur">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
			<span class="text-lg font-semibold tracking-tight">mdf viewer</span>
			<span class="text-xs text-muted-foreground">${escapeHtml(context.directoryLabel)}</span>
		</div>
	</header>
	<div class="flex flex-1">
		<aside class="hidden w-72 border-r border-border bg-muted/40 lg:block">
			<nav class="h-full overflow-y-auto px-4 py-6">
				${navigationHtml}
			</nav>
		</aside>
		<main class="flex-1 overflow-y-auto">
			<div class="mx-auto w-full max-w-4xl px-4 py-8">
				${mobileSelector}
				<header class="space-y-4 border-b border-border pb-6">
					<h1 class="text-3xl font-semibold tracking-tight">${escapeHtml(document.meta.title)}</h1>
					${descriptionHtml}
				</header>
				<article class="prose prose-slate mt-8 max-w-none dark:prose-invert">
					${document.html}
				</article>
				${renderFooter(document)}
			</div>
		</main>
	</div>
</div>
</body>
</html>`;
}

function matchesAllFilters(
	frontMatter: Record<string, unknown>,
	filters: readonly ParsedFilter[],
): boolean {
	return filters.every((filter) => matchesParsedFilter(frontMatter, filter));
}

function extractVirtualPath(
	frontMatter: Record<string, unknown>,
	param: string,
	separator: string,
	filePath: string,
	cwd: string,
): { rawVirtualPath: string | null; segments: string[] } {
	const raw = frontMatter[param];
	if (raw === undefined || raw === null) {
		return { rawVirtualPath: null, segments: [] };
	}

	if (typeof raw !== "string") {
		throw new MdfError(
			"INVALID_VIRTUAL_PATH_VALUE",
			`Front matter field "${param}" must be a string in ${formatDisplayPath(filePath, cwd)}`,
		);
	}

	const trimmed = raw.trim();
	if (!trimmed) {
		return { rawVirtualPath: null, segments: [] };
	}

	return {
		rawVirtualPath: trimmed,
		segments: splitVirtualPathInput(trimmed, separator),
	};
}

function splitVirtualPathInput(value: string, separator: string): string[] {
	return value
		.split(separator)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
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

function createSlug(relativePath: string): string {
	const normalized = relativePath.replaceAll("\\", "/");
	return normalized.replace(/\.[^.]+$/u, "");
}

function slugSegments(slug: string): string[] {
	return slug
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function encodeDocumentId(relativePath: string): string {
	return Buffer.from(relativePath).toString("base64url");
}

function buildNavigation(
	documents: readonly ViewerDocument[],
): ViewerNavigationDirectory {
	const root: MutableDirectoryNode = {
		type: "dir",
		name: "",
		children: [],
		directories: new Map(),
	};

	for (const doc of documents) {
		let current = root;
		const directories = doc.navigationSegments.slice(0, -1);
		for (const segment of directories) {
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

		const labelFallback = doc.navigationSegments.at(-1) ?? doc.meta.title;
		const fileNode: ViewerNavigationFile = {
			type: "file",
			name: doc.meta.title || labelFallback,
			documentId: doc.id,
			routePath: doc.meta.routePath,
		};
		current.children.push(fileNode);
	}

	sortDirectory(root);
	return freezeDirectory(root);
}

function sortDirectory(directory: MutableDirectoryNode): void {
	directory.children.sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "dir" ? -1 : 1;
		}
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});

	for (const child of directory.children) {
		if (child.type === "dir") {
			sortDirectory(child);
		}
	}
}

function freezeDirectory(
	node: MutableDirectoryNode,
): ViewerNavigationDirectory {
	return {
		type: "dir",
		name: node.name,
		children: node.children.map((child) =>
			child.type === "dir" ? freezeDirectory(child) : child,
		),
	};
}

function renderNavigation(
	node: ViewerNavigationDirectory,
	activeId: string,
): string {
	if (!node.children.length) {
		return `<p class="text-sm text-muted-foreground">No documents available</p>`;
	}

	const items = node.children
		.map((child) => renderNavigationNode(child, activeId, 0))
		.join("");
	return `<ul class="space-y-1">${items}</ul>`;
}

function renderNavigationNode(
	node: ViewerNavigationNode,
	activeId: string,
	depth: number,
): string {
	if (node.type === "dir") {
		const label = node.name
			? `<div class="${navIndent(depth)} px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">${escapeHtml(node.name)}</div>`
			: "";
		const children = node.children
			.map((child) => renderNavigationNode(child, activeId, depth + 1))
			.join("");
		return `<li class="space-y-1">${label}${children ? `<ul class="space-y-1">${children}</ul>` : ""}</li>`;
	}

	const isActive = node.documentId === activeId;
	const variant = isActive
		? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
		: "text-muted-foreground hover:bg-muted hover:text-foreground";
	return `<li><a class="block rounded-md px-2 py-1 text-sm transition-colors ${navIndent(depth)} ${variant}" href="/?doc=${encodeURIComponent(node.documentId)}">${escapeHtml(node.name)}</a></li>`;
}

function navIndent(depth: number): string {
	switch (depth) {
		case 0:
			return "";
		case 1:
			return "pl-4";
		case 2:
			return "pl-6";
		case 3:
			return "pl-8";
		default:
			return "pl-10";
	}
}

function renderFooter(document: ViewerDocument): string {
	const entries = Object.entries(document.frontMatter)
		.filter(([key]) => key !== "title")
		.sort((a, b) =>
			a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
		);

	if (!entries.length) {
		return "";
	}

	const rows = entries
		.map(([key, value]) => {
			return `<div class="grid grid-cols-1 gap-2 border-t border-border py-3 first:border-t-0 md:grid-cols-[160px_1fr]">
				<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">${escapeHtml(key)}</div>
				<div class="text-sm text-foreground">${renderFooterValue(value)}</div>
			</div>`;
		})
		.join("");

	return `<footer class="mt-12 rounded-lg border border-border bg-card/40 p-6">
		<div class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
			<span class="text-sm font-medium text-muted-foreground">Front matter</span>
			<span class="text-xs text-muted-foreground">${escapeHtml(document.displayPath)}</span>
		</div>
		<div class="mt-4">${rows}</div>
	</footer>`;
}

function renderFooterValue(value: unknown): string {
	if (value === undefined || value === null) {
		return `<span class="text-muted-foreground">—</span>`;
	}

	if (Array.isArray(value)) {
		if (!value.length) {
			return `<span class="text-muted-foreground">—</span>`;
		}
		return value
			.map((entry) => renderFooterValue(entry))
			.filter((entry) => entry.length > 0)
			.join("<br />");
	}

	if (value instanceof Date) {
		return escapeHtml(value.toISOString());
	}

	if (typeof value === "object") {
		try {
			const json = JSON.stringify(value, null, 2) ?? "";
			return `<pre class="whitespace-pre-wrap text-xs text-muted-foreground">${escapeHtml(json)}</pre>`;
		} catch {
			return escapeHtml(String(value));
		}
	}

	return escapeHtml(String(value));
}

function renderMobileSelector(
	context: ViewerContext,
	activeId: string,
): string {
	const options = context.documents
		.map((doc) => {
			const selected = doc.id === activeId ? " selected" : "";
			return `<option value="/?doc=${encodeURIComponent(doc.id)}"${selected}>${escapeHtml(doc.meta.title)}</option>`;
		})
		.join("");

	return `<div class="mb-6 lg:hidden">
		<label class="text-sm font-medium text-muted-foreground" for="mdf-viewer-select">Document</label>
		<select id="mdf-viewer-select" class="mt-2 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onchange="if (this.value) window.location.href = this.value;">
			${options}
		</select>
	</div>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function formatAddress(info: AddressInfo): string {
	const address = info.address === "::" ? "localhost" : info.address;
	return `${address}:${info.port}`;
}

async function waitForShutdown(server: ServerType): Promise<void> {
	await new Promise<void>((resolve) => {
		let resolved = false;
		const finalize = (): void => {
			if (resolved) {
				return;
			}
			resolved = true;
			server.close(() => resolve());
		};

		const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
		signals.forEach((signal) => {
			process.once(signal, finalize);
		});
	});
}
