import type { FSWatcher } from "node:fs";
import { promises as fs, watch as watchDirectory } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import type { TokensList } from "marked";
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
	let context = await prepareViewerContext(options);
	const appControls = createViewerApp(() => context);
	const port = options.port ?? 4173;
	const hostname = options.host ?? "127.0.0.1";

	const server = serve(
		{ fetch: appControls.app.fetch, port, hostname },
		(info: AddressInfo) => {
			const hostLabel = formatAddress(info);
			console.log(`Viewer running at http://${hostLabel}`);
		},
	);

	const stopWatching = await enableHotReload(context.directory, async () => {
		try {
			const next = await prepareViewerContext(options);
			context = next;
			appControls.notifyReload();
		} catch (error) {
			console.error("Failed to reload viewer after change:", error);
		}
	});

	try {
		await waitForShutdown(server);
	} finally {
		await stopWatching();
	}
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

		const id = encodeDocumentId(relativePath);
		const html = renderDocumentMarkdown(document.body, meta.title, {
			assetBaseUrl: buildDocumentAssetBaseUrl(id),
		});
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

interface ViewerAppControls {
	app: Hono;
	notifyReload(): void;
}

export function createViewerApp(
	getContext: () => ViewerContext,
): ViewerAppControls {
	const app = new Hono();
	const reloadListeners = new Set<() => boolean>();

	function broadcastReload(): void {
		for (const listener of [...reloadListeners]) {
			if (!listener()) {
				reloadListeners.delete(listener);
			}
		}
	}

	app.get("/", (c) => {
		const context = getContext();
		const requestedId = c.req.query("doc");
		const document = requestedId
			? (context.documentMap.get(requestedId) ?? context.defaultDocument)
			: context.defaultDocument;
		return c.html(renderViewerHtml(context, document));
	});

	app.get("/documents/:id/assets/:assetPath{.+}", async (c) => {
		const context = getContext();
		const document = context.documentMap.get(c.req.param("id"));
		if (!document) {
			return c.json({ error: "Not Found" }, 404);
		}

		const requestedPath = c.req.param("assetPath") ?? "";
		const assetPath = resolveDocumentAssetPath(
			document.filePath,
			requestedPath,
			context.directory,
		);

		if (!assetPath) {
			return c.json({ error: "Not Found" }, 404);
		}

		try {
			const stats = await fs.stat(assetPath);
			if (!stats.isFile()) {
				return c.json({ error: "Not Found" }, 404);
			}

			const contents = await fs.readFile(assetPath);
			const arrayBuffer = (contents.buffer as ArrayBuffer).slice(
				contents.byteOffset,
				contents.byteOffset + contents.byteLength,
			);
			return c.newResponse(arrayBuffer, 200, {
				"Content-Type": determineContentType(assetPath),
				"Cache-Control": "no-cache",
			});
		} catch (error) {
			if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
				return c.json({ error: "Not Found" }, 404);
			}
			throw error;
		}
	});

	app.get("/documents/:id", (c) => {
		const context = getContext();
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

	app.get("/events", (c) => {
		const encoder = new TextEncoder();
		let closed = false;
		let removeListener: (() => void) | null = null;

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const send = (message: string): boolean => {
					if (closed) {
						return false;
					}

					try {
						controller.enqueue(encoder.encode(message));
						return true;
					} catch {
						closed = true;
						return false;
					}
				};

				send(": connected\n\n");
				send("retry: 2000\n\n");

				const listener = (): boolean => send("event: reload\ndata: {}\n\n");
				reloadListeners.add(listener);
				removeListener = () => reloadListeners.delete(listener);
			},
			cancel() {
				closed = true;
				removeListener?.();
			},
		});

		return c.newResponse(stream, 200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
	});

	return { app, notifyReload: broadcastReload };
}

interface RenderDocumentMarkdownOptions {
	assetBaseUrl?: string;
}

function renderDocumentMarkdown(
	markdown: string,
	title: string | null,
	options: RenderDocumentMarkdownOptions = {},
): string {
	const tokens = marked.lexer(markdown);
	stripLeadingTitleHeading(tokens, title);
	if (options.assetBaseUrl) {
		rewriteDocumentAssetTokens(tokens, options.assetBaseUrl);
	}
	const rendered = marked.parser(tokens);
	return typeof rendered === "string" ? rendered : String(rendered);
}

function rewriteDocumentAssetTokens(
	tokens: TokensList,
	assetBaseUrl: string,
): void {
	marked.walkTokens(tokens, (token) => {
		if (token.type === "image") {
			token.href = rewriteRelativeAssetHref(token.href, assetBaseUrl);
		}
	});
}

function rewriteRelativeAssetHref(
	href: string | null | undefined,
	baseUrl: string,
): string {
	if (href === null || href === undefined) {
		return "";
	}

	const trimmed = href.trim();
	if (!trimmed) {
		return trimmed;
	}

	if (trimmed.startsWith("#")) {
		return trimmed;
	}

	if (trimmed.startsWith("//")) {
		return trimmed;
	}

	if (trimmed.startsWith("/")) {
		return trimmed;
	}

	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/u.test(trimmed)) {
		return trimmed;
	}

	const { path: pathPart, suffix } = splitHref(trimmed);
	const encodedSegments: string[] = [];
	for (const segment of pathPart.split("/")) {
		if (!segment || segment === ".") {
			continue;
		}

		if (segment === "..") {
			encodedSegments.push(segment);
			continue;
		}

		encodedSegments.push(encodeURIComponent(segment));
	}

	const encodedPath = encodedSegments.join("/");
	return `${baseUrl}${encodedPath}${suffix}`;
}

function splitHref(value: string): { path: string; suffix: string } {
	let pathPart = value;
	let suffix = "";

	const hashIndex = pathPart.indexOf("#");
	if (hashIndex >= 0) {
		suffix = pathPart.slice(hashIndex);
		pathPart = pathPart.slice(0, hashIndex);
	}

	const queryIndex = pathPart.indexOf("?");
	if (queryIndex >= 0) {
		suffix = pathPart.slice(queryIndex) + suffix;
		pathPart = pathPart.slice(0, queryIndex);
	}

	return { path: pathPart, suffix };
}

function stripLeadingTitleHeading(
	tokens: TokensList,
	title: string | null,
): void {
	const normalizedTitle = normalizeHeadingComparisonValue(title);
	if (!normalizedTitle) {
		return;
	}

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token) {
			break;
		}

		if (token.type === "space") {
			continue;
		}

		if (token.type === "heading" && token.depth === 1) {
			const normalizedHeading = normalizeHeadingComparisonValue(token.text);
			if (normalizedHeading === normalizedTitle) {
				tokens.splice(index, 1);
				removeLeadingSpaceTokens(tokens, index);
			}
		}

		break;
	}
}

function removeLeadingSpaceTokens(
	tokens: TokensList,
	startIndex: number,
): void {
	while (startIndex < tokens.length && tokens[startIndex]?.type === "space") {
		tokens.splice(startIndex, 1);
	}
}

function normalizeHeadingComparisonValue(
	value: string | null | undefined,
): string | null {
	if (!value) {
		return null;
	}

	const collapsed = value.replace(/\s+/gu, " ").trim();
	if (!collapsed) {
		return null;
	}

	return collapsed.toLowerCase();
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
	const hotReloadScript = `
<script>
(function () {
        if (!("EventSource" in window)) {
                return;
        }

        var source = new EventSource("/events");
        source.addEventListener("reload", function () {
                window.location.reload();
        });
})();
</script>`;

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
${hotReloadScript}
</body>
</html>`;
}

async function enableHotReload(
	rootDirectory: string,
	onChange: () => Promise<void>,
): Promise<() => Promise<void>> {
	const normalizedRoot = path.resolve(rootDirectory);
	const watchers = new Map<string, FSWatcher>();
	let disposed = false;
	let scheduled = false;
	let running = false;
	let rerun = false;

	const schedule = (): void => {
		if (disposed) {
			return;
		}

		if (running) {
			rerun = true;
			return;
		}

		if (scheduled) {
			return;
		}

		scheduled = true;
		const timer = setTimeout(async () => {
			scheduled = false;
			if (disposed) {
				return;
			}

			running = true;
			try {
				await onChange();
			} finally {
				running = false;
				if (rerun) {
					rerun = false;
					schedule();
				}
			}
		}, 75);

		if (typeof timer === "object" && typeof timer.unref === "function") {
			timer.unref();
		}
	};

	const ensureChildWatcher = async (target: string): Promise<void> => {
		if (disposed) {
			return;
		}

		try {
			const stats = await fs.stat(target);
			if (stats.isDirectory()) {
				await registerWatcher(path.resolve(target));
			}
		} catch {
			// Ignore race conditions where the path was removed before we could inspect it.
		}
	};

	const registerWatcher = async (directory: string): Promise<void> => {
		if (disposed || watchers.has(directory)) {
			return;
		}

		let watcher: FSWatcher;
		try {
			watcher = watchDirectory(directory, (_eventType, filename) => {
				if (disposed) {
					return;
				}

				if (filename) {
					const childPath = path.join(directory, filename.toString());
					void ensureChildWatcher(childPath);
				}

				schedule();
			});
		} catch (error) {
			console.error(`Failed to watch ${directory}:`, error);
			return;
		}

		watchers.set(directory, watcher);

		watcher.on("error", (error: NodeJS.ErrnoException) => {
			if (disposed) {
				return;
			}

			const code = error?.code;
			if (code === "ENOENT" || code === "EACCES") {
				return;
			}

			console.error(`Viewer watcher error for ${directory}:`, error);
		});

		try {
			const entries = await fs.readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const childDirectory = path.join(directory, entry.name);
					await registerWatcher(childDirectory);
				}
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | undefined)?.code;
			if (code !== "ENOENT" && code !== "EACCES") {
				console.error(`Failed to read directory ${directory}:`, error);
			}
		}
	};

	await registerWatcher(normalizedRoot);

	return async () => {
		disposed = true;
		for (const watcher of watchers.values()) {
			watcher.close();
		}
	};
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

function buildDocumentAssetBaseUrl(documentId: string): string {
	return `/documents/${encodeURIComponent(documentId)}/assets/`;
}

function resolveDocumentAssetPath(
	documentPath: string,
	requestedPath: string,
	rootDirectory: string,
): string | null {
	const documentDirectory = path.dirname(documentPath);
	const normalizedRequest = requestedPath.replace(/\\/gu, "/");
	const resolved = path.resolve(documentDirectory, normalizedRequest);
	if (!isPathWithinRoot(resolved, rootDirectory)) {
		return null;
	}
	return resolved;
}

function isPathWithinRoot(targetPath: string, rootDirectory: string): boolean {
	const relative = path.relative(
		path.resolve(rootDirectory),
		path.resolve(targetPath),
	);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function determineContentType(filePath: string): string {
	switch (path.extname(filePath).toLowerCase()) {
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".svg":
			return "image/svg+xml";
		case ".webp":
			return "image/webp";
		case ".avif":
			return "image/avif";
		case ".bmp":
			return "image/bmp";
		case ".ico":
			return "image/x-icon";
		default:
			return "application/octet-stream";
	}
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

const MAX_NAVIGATION_DEPTH = 6;

function renderNavigation(
	node: ViewerNavigationDirectory,
	activeId: string,
): string {
	if (!node.children.length) {
		return `<p class="text-sm text-muted-foreground">No documents available</p>`;
	}

	const items = node.children
		.map((child) => renderNavigationNode(child, activeId, 0, []))
		.filter((child) => child.length > 0)
		.join("");
	return `<ul class="space-y-1" data-viewer-nav="tree">${items}</ul>`;
}

function renderNavigationNode(
	node: ViewerNavigationNode,
	activeId: string,
	depth: number,
	path: readonly string[],
): string {
	return node.type === "dir"
		? renderNavigationDirectory(node, activeId, depth, path)
		: renderNavigationFile(node, activeId, depth);
}

function renderNavigationDirectory(
	node: ViewerNavigationDirectory,
	activeId: string,
	depth: number,
	path: readonly string[],
): string {
	const name = node.name || "Untitled";
	const fullPath = node.name ? [...path, node.name] : path;
	const containsActive = directoryContainsDocument(node, activeId);
	const hasChildren = node.children.length > 0;
	const nextDepth = depth + 1;
	const canRenderChildren = nextDepth <= MAX_NAVIGATION_DEPTH;
	const dataPath = fullPath.length
		? ` data-viewer-nav-path="${escapeHtml(fullPath.join("/"))}"`
		: "";

	if (!hasChildren) {
		return `<li data-viewer-nav-node="dir" data-viewer-nav-depth="${depth}"${dataPath}>
			<div class="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground">${escapeHtml(name)}</div>
		</li>`;
	}

	let bodyHtml: string;
	if (!canRenderChildren) {
		bodyHtml = `<div class="mt-2 rounded-md border border-border/40 bg-card/40 px-2 py-2 text-xs text-muted-foreground">Nested levels deeper than ${MAX_NAVIGATION_DEPTH} are hidden.</div>`;
	} else {
		const childItems = node.children
			.map((child) =>
				renderNavigationNode(child, activeId, nextDepth, fullPath),
			)
			.filter((child) => child.length > 0)
			.join("");
		bodyHtml = childItems.length
			? `<ul class="mt-1 space-y-1 border-l border-border/40 pl-3" data-viewer-nav-depth="${nextDepth}">${childItems}</ul>`
			: `<div class="mt-1 pl-3 text-xs text-muted-foreground">No entries</div>`;
	}

	const openAttribute = containsActive ? " open" : "";
	const chevronIcon = `<svg class="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>`;
	const summaryClasses = containsActive
		? "flex list-none items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
		: "flex list-none items-center justify-between gap-2 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

	return `<li data-viewer-nav-node="dir" data-viewer-nav-depth="${depth}"${dataPath}>
		<details class="group"${openAttribute}>
			<summary class="${summaryClasses}">
				<span class="truncate">${escapeHtml(name)}</span>
				${chevronIcon}
			</summary>
			${bodyHtml}
		</details>
	</li>`;
}

function renderNavigationFile(
	node: ViewerNavigationFile,
	activeId: string,
	depth: number,
): string {
	const isActive = node.documentId === activeId;
	const variant = isActive
		? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
		: "text-muted-foreground hover:bg-muted hover:text-foreground";
	return `<li data-viewer-nav-node="file" data-viewer-nav-depth="${depth}"><a class="block rounded-md px-2 py-1 text-sm transition-colors ${variant}" href="/?doc=${encodeURIComponent(node.documentId)}">${escapeHtml(node.name)}</a></li>`;
}

function directoryContainsDocument(
	node: ViewerNavigationDirectory,
	documentId: string,
): boolean {
	for (const child of node.children) {
		if (child.type === "file" && child.documentId === documentId) {
			return true;
		}
		if (child.type === "dir" && directoryContainsDocument(child, documentId)) {
			return true;
		}
	}
	return false;
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
