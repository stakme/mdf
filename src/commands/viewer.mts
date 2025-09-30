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
	type ParsedFilter,
	parseFilterExpression,
} from "../utils/filters.mts";
import { logInvalidFileWarnings } from "../utils/invalid-file-warning.mts";
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
	strict?: boolean;
	ignoreInvalid?: boolean;
	/** Enable per-request access logs in the viewer server */
	accessLog?: boolean;
	/** Enable hot reload (SSE + file watchers). Defaults to true. */
	reload?: boolean;
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

interface ViewerDocumentEntry {
	schema: LoadedSchema;
	frontMatter: ViewerDocument["frontMatter"];
	document: ViewerDocument;
}

export interface ViewerContext {
	cwd: string;
	directory: string;
	directoryLabel: string;
	headerOptions: ViewerHeaderOption[];
	documents: ViewerDocument[];
	documentMap: Map<string, ViewerDocument>;
	navigation: ViewerNavigationDirectory;
	defaultDocument: ViewerDocument | null;
	frontMatterIndex: ViewerFrontMatterIndex;
	virtualPathParam: string;
	virtualPathSeparator: string;
	warnings: InvalidFileWarning[];
}

export interface ViewerHeaderOption {
	label: string;
	value: string;
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

export interface ViewerFrontMatterIndex {
	fields: ViewerFrontMatterField[];
	fieldMap: Map<string, ViewerFrontMatterField>;
}

export interface ViewerFrontMatterField {
	name: string;
	values: ViewerFrontMatterValue[];
	valueMap: Map<string, ViewerFrontMatterValue>;
}

export interface ViewerFrontMatterValue {
	value: string;
	documents: ViewerDocument[];
}

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
	logInvalidFileWarnings(context.warnings, options.cwd);
	const appControls = createViewerApp(() => context, {
		accessLog: options.accessLog === true,
		enableHotReload: options.reload !== false,
	});
	const port = options.port ?? 4173;
	const hostname = options.host ?? "127.0.0.1";

	const server = serve(
		{ fetch: appControls.app.fetch, port, hostname },
		(info: AddressInfo) => {
			const hostLabel = formatAddress(info);
			console.log(`Viewer running at http://${hostLabel}`);
		},
	);

	const shouldWatch = options.reload !== false;
	const stopWatching = shouldWatch
		? await enableHotReload(context.directory, async () => {
				try {
					const next = await prepareViewerContext(options);
					context = next;
					logInvalidFileWarnings(next.warnings, options.cwd);
					appControls.notifyReload();
				} catch (error) {
					console.error("Failed to reload viewer after change:", error);
				}
			})
		: async () => {};

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

	const parsedFilters = (options.filters ?? []).map(parseFilterExpression);
	const separator = virtualPathConfig.separator ?? "/";
	const prefixSegments = options.virtualPathPrefix?.length
		? splitVirtualPathInput(options.virtualPathPrefix, separator)
		: undefined;
	const headerOptions = buildViewerHeaderOptions(options);

	const collected: ViewerDocumentEntry[] = [];
	const warnings: InvalidFileWarning[] = [];
	for (const filePath of files) {
		const warningMessages: string[] = [];
		const flushWarnings = (): void => {
			if (!warningMessages.length) {
				return;
			}
			const existing = warnings.find((entry) => entry.filePath === filePath);
			if (existing) {
				existing.messages.push(...warningMessages);
			} else {
				warnings.push({ filePath, messages: [...warningMessages] });
			}
			warningMessages.length = 0;
		};
		let document: MarkdownDocument | null = null;
		try {
			document = await readMarkdownDocument(filePath);
		} catch (error) {
			if (options.strict) {
				throw error;
			}
			warningMessages.push(formatErrorMessage(error));

			if (options.ignoreInvalid) {
				flushWarnings();
				continue;
			}

			try {
				const raw = await fs.readFile(filePath, "utf8");
				document = { frontMatter: {}, body: raw, raw };
			} catch (readError) {
				warningMessages.push(formatErrorMessage(readError));
				flushWarnings();
				continue;
			}
		}

		if (!document) {
			flushWarnings();
			continue;
		}

		const frontMatter = document.frontMatter ?? {};

		if (!matchesAllFilters(frontMatter, parsedFilters)) {
			flushWarnings();
			continue;
		}

		let rawVirtualPath: string | null;
		let segments: string[];
		try {
			({ rawVirtualPath, segments } = extractVirtualPath(
				frontMatter,
				virtualPathConfig.param,
				separator,
				filePath,
				options.cwd,
			));
		} catch (error) {
			if (options.strict) {
				throw error;
			}
			warningMessages.push(formatErrorMessage(error));

			if (options.ignoreInvalid) {
				flushWarnings();
				continue;
			}

			rawVirtualPath = null;
			segments = [];
		}

		if (prefixSegments && !segmentsStartsWith(segments, prefixSegments)) {
			flushWarnings();
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

		const schemaEntry = config.getSchemaForRelativePath(
			path.relative(options.cwd, filePath),
		);

		const viewerDocument: ViewerDocument = {
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
		};

		flushWarnings();

		collected.push({
			schema: schemaEntry,
			frontMatter,
			document: viewerDocument,
		});
	}

	const sortedEntries = sortSchemaDocuments(collected, (a, b) =>
		compareViewerDocuments(a.document, b.document),
	);
	const documents = sortedEntries.map((entry) => entry.document);

	const navigation = buildNavigation(documents);
	const documentMap = new Map(documents.map((doc) => [doc.id, doc]));
	const defaultDocument = documents[0] ?? null;
	const frontMatterIndex = buildFrontMatterIndex(documents);

	return {
		cwd: options.cwd,
		directory: resolvedDirectory,
		directoryLabel: formatDisplayPath(resolvedDirectory, options.cwd),
		headerOptions,
		documents,
		documentMap,
		navigation,
		defaultDocument,
		frontMatterIndex,
		virtualPathParam: virtualPathConfig.param,
		virtualPathSeparator: separator,
		warnings,
	};
}

interface ViewerAppControls {
	app: Hono;
	notifyReload(): void;
}

function buildViewerHeaderOptions(
	options: ViewerCommandOptions,
): ViewerHeaderOption[] {
	const items: ViewerHeaderOption[] = [];

	for (const rawFilter of options.filters ?? []) {
		const filter = rawFilter.trim();
		if (filter.length === 0) {
			continue;
		}
		items.push({ label: "Filter", value: filter });
	}

	const virtualPathPrefix = options.virtualPathPrefix?.trim();
	if (virtualPathPrefix && virtualPathPrefix.length > 0) {
		items.push({ label: "Virtual Path", value: virtualPathPrefix });
	}

	if (typeof options.port === "number" && Number.isFinite(options.port)) {
		items.push({ label: "Port", value: String(options.port) });
	}

	const host = options.host?.trim();
	if (host && host.length > 0) {
		items.push({ label: "Host", value: host });
	}

	return items;
}

export function createViewerApp(
	getContext: () => ViewerContext,
	options?: { accessLog?: boolean; enableHotReload?: boolean },
): ViewerAppControls {
	const app = new Hono();
	const reloadListeners = new Set<() => boolean>();
	const enableHotReload = options?.enableHotReload !== false;

	if (options?.accessLog) {
		app.use("*", async (c, next) => {
			const start = Date.now();
			const method = c.req.method;
			const path = c.req.path;
			try {
				await next();
			} finally {
				const elapsed = Date.now() - start;
				const status = c.res.status;
				console.log(`[viewer] ${method} ${path} -> ${status} ${elapsed}ms`);
			}
		});
	}

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
			? (context.documentMap.get(requestedId) ?? null)
			: context.defaultDocument;
		if (!document) {
			return c.html(renderEmptyViewerHtml(context, { enableHotReload }));
		}
		return c.html(renderViewerHtml(context, document, { enableHotReload }));
	});

	app.get("/fm", (c) => {
		const context = getContext();
		return c.html(renderFrontMatterIndexHtml(context, { enableHotReload }));
	});

	app.get("/fm/:field", (c) => {
		const context = getContext();
		const fieldName = c.req.param("field");
		const field = context.frontMatterIndex.fieldMap.get(fieldName);
		if (!field) {
			return c.json({ error: "Not Found" }, 404);
		}

		return c.html(
			renderFrontMatterFieldHtml(context, field, { enableHotReload }),
		);
	});

	app.get("/fm/:field/:value", (c) => {
		const context = getContext();
		const fieldName = c.req.param("field");
		const valueKey = c.req.param("value");
		const field = context.frontMatterIndex.fieldMap.get(fieldName);
		const valueEntry = field?.valueMap.get(valueKey);
		if (!field || !valueEntry) {
			return c.json({ error: "Not Found" }, 404);
		}

		return c.html(
			renderFrontMatterValueHtml(context, field, valueEntry, {
				enableHotReload,
			}),
		);
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

	if (enableHotReload) {
		app.get("/events", (c) => {
			const encoder = new TextEncoder();
			let closed = false;
			let removeListener: (() => void) | null = null;

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					if (options?.accessLog) {
						console.log("[viewer] sse: connect");
					}
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
					if (options?.accessLog) {
						console.log("[viewer] sse: disconnect");
					}
				},
			});

			return c.newResponse(stream, 200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
			});
		});
	}

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

interface RenderViewerPageOptions {
	pageTitle: string;
	activeDocumentId?: string | null;
	mainContentHtml: string;
}

function renderViewerPage(
	context: ViewerContext,
	options: RenderViewerPageOptions,
	extras?: { enableHotReload?: boolean },
): string {
	const navigationHtml = renderNavigation(
		context.navigation,
		options.activeDocumentId ?? "",
	);
	const headerOptionsHtml = renderHeaderOptions(context.headerOptions);
	const directoryLabelHtml = escapeHtml(context.directoryLabel);
	const hotReloadEnabled = extras?.enableHotReload !== false;
	const hotReloadScript = !hotReloadEnabled
		? ""
		: `
<script>
(function () {
        if (!("EventSource" in window)) {
                return;
        }

        var source = new EventSource("/events");
        // Ensure the SSE connection doesn't leak across navigations
        window.addEventListener("beforeunload", function () { try { source.close(); } catch (e) { /* ignore */ } });
        source.addEventListener("reload", function () {
                window.location.reload();
        });
})();
</script>`;

	const pageTitle = `${options.pageTitle} – mdf viewer`;

	return `<!DOCTYPE html>
<html lang="en" class="dark" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(pageTitle)}</title>
<script src="https://cdn.tailwindcss.com?plugins=typography"></script>
<link rel="stylesheet" href="https://ui.shadcn.com/themes/v0/default.css" />
</head>
<body class="min-h-screen bg-background text-foreground">
<div class="flex min-h-screen flex-col">
        <header class="border-b border-border bg-card/60 backdrop-blur">
                <div class="mx-auto w-full max-w-6xl px-6 py-4">
                                <div class="flex flex-wrap items-center justify-between gap-4">
                                        <a class="text-lg font-semibold tracking-tight hover:underline" href="/">mdf viewer</a>
                                        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <span class="truncate">${directoryLabelHtml}</span>
                                                ${headerOptionsHtml}
                                        </div>
                                </div>
                        </div>
                </header>
        <div class="flex flex-1">
                <aside class="hidden w-72 border-r border-border bg-muted/40 lg:block">
                        <nav class="h-full overflow-y-auto px-4 py-6">
                                ${navigationHtml}
                        </nav>
                </aside>
                <main class="flex-1 overflow-y-auto">
                        ${options.mainContentHtml}
                </main>
        </div>
</div>
${hotReloadScript}
</body>
</html>`;
}

export function renderViewerHtml(
	context: ViewerContext,
	document: ViewerDocument,
	options?: { enableHotReload?: boolean },
): string {
	const descriptionHtml = document.meta.description
		? `<p class="text-base text-muted-foreground">${escapeHtml(document.meta.description)}</p>`
		: "";
	const mobileSelector = renderMobileSelector(context, document.id);

	const mainContentHtml = `<div class="mx-auto w-full max-w-4xl px-4 py-8">
                ${mobileSelector}
                <header class="space-y-4 border-b border-border pb-6">
                        <h1 class="text-3xl font-semibold tracking-tight">${escapeHtml(document.meta.title)}</h1>
                        ${descriptionHtml}
                </header>
                <article class="prose prose-slate mt-8 max-w-none dark:prose-invert">
                        ${document.html}
                </article>
                ${renderFooter(document, context)}
        </div>`;

	return renderViewerPage(
		context,
		{
			pageTitle: document.meta.title || "Document",
			activeDocumentId: document.id,
			mainContentHtml,
		},
		{ enableHotReload: options?.enableHotReload !== false },
	);
}

export function renderEmptyViewerHtml(
	context: ViewerContext,
	options?: { enableHotReload?: boolean },
): string {
	const message = `Add Markdown documents to ${escapeHtml(context.directoryLabel)} to see them here.`;
	const mainContentHtml = `<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
                <div class="rounded-lg border border-border bg-card/40 p-10 text-center">
                        <h1 class="text-2xl font-semibold tracking-tight">No documents available</h1>
                        <p class="mt-3 text-sm text-muted-foreground">${message}</p>
                </div>
        </div>`;

	return renderViewerPage(
		context,
		{
			pageTitle: "Viewer",
			activeDocumentId: null,
			mainContentHtml,
		},
		{ enableHotReload: options?.enableHotReload !== false },
	);
}

export function renderFrontMatterIndexHtml(
	context: ViewerContext,
	options?: { enableHotReload?: boolean },
): string {
	const mobileSelector = renderMobileSelector(
		context,
		context.defaultDocument?.id ?? context.documents[0]?.id ?? "",
	);
	let bodyHtml: string;
	if (!context.frontMatterIndex.fields.length) {
		bodyHtml = `<div class="rounded-lg border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No linkable front matter fields found.</div>`;
	} else {
		const items = context.frontMatterIndex.fields
			.map((field) => {
				const countLabel =
					field.values.length === 1
						? "1 value"
						: `${field.values.length} values`;
				return `<li class="rounded-md border border-border/60 bg-card/40 px-4 py-3 transition hover:border-border"><div class="flex items-center justify-between gap-4"><a class="text-sm font-medium text-primary underline-offset-4 hover:underline" href="${buildFrontMatterFieldUrl(field.name)}">${escapeHtml(field.name)}</a><span class="text-xs text-muted-foreground">${escapeHtml(countLabel)}</span></div></li>`;
			})
			.join("");
		bodyHtml = `<ul class="space-y-2">${items}</ul>`;
	}

	const mainContentHtml = `<div class="mx-auto w-full max-w-4xl px-4 py-8">
                ${mobileSelector}
                <header class="space-y-3 border-b border-border pb-6">
                        <h1 class="text-3xl font-semibold tracking-tight">Front matter</h1>
                        <p class="text-sm text-muted-foreground">Browse documents grouped by shared front matter fields.</p>
                </header>
                <section class="mt-8 space-y-4">
                        ${bodyHtml}
                </section>
        </div>`;

	return renderViewerPage(
		context,
		{
			pageTitle: "Front matter",
			activeDocumentId: null,
			mainContentHtml,
		},
		{ enableHotReload: options?.enableHotReload !== false },
	);
}

export function renderFrontMatterFieldHtml(
	context: ViewerContext,
	field: ViewerFrontMatterField,
	options?: { enableHotReload?: boolean },
): string {
	const mobileSelector = renderMobileSelector(
		context,
		context.defaultDocument?.id ?? context.documents[0]?.id ?? "",
	);

	const valuesHtml = field.values.length
		? `<ul class="space-y-2">${field.values
				.map((entry) => {
					const count = entry.documents.length;
					const countLabel = count === 1 ? "1 document" : `${count} documents`;
					return `<li class="rounded-md border border-border/60 bg-card/40 px-4 py-3 transition hover:border-border"><div class="flex items-center justify-between gap-4"><a class="text-sm font-medium text-primary underline-offset-4 hover:underline" href="${buildFrontMatterValueUrl(field.name, entry.value)}">${escapeHtml(entry.value)}</a><span class="text-xs text-muted-foreground">${escapeHtml(countLabel)}</span></div></li>`;
				})
				.join("")}</ul>`
		: `<div class="rounded-lg border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No documents define this field.</div>`;

	const mainContentHtml = `<div class="mx-auto w-full max-w-4xl px-4 py-8">
                ${mobileSelector}
                <header class="space-y-2 border-b border-border pb-6">
                        <div class="text-xs uppercase tracking-wide text-muted-foreground">Front matter field</div>
                        <h1 class="text-3xl font-semibold tracking-tight">${escapeHtml(field.name)}</h1>
                </header>
                <section class="mt-8 space-y-4">
                        ${valuesHtml}
                </section>
        </div>`;

	return renderViewerPage(
		context,
		{
			pageTitle: `Front matter: ${field.name}`,
			activeDocumentId: null,
			mainContentHtml,
		},
		{ enableHotReload: options?.enableHotReload !== false },
	);
}

export function renderFrontMatterValueHtml(
	context: ViewerContext,
	field: ViewerFrontMatterField,
	value: ViewerFrontMatterValue,
	options?: { enableHotReload?: boolean },
): string {
	const mobileSelector = renderMobileSelector(
		context,
		context.defaultDocument?.id ?? context.documents[0]?.id ?? "",
	);

	const documentsHtml = value.documents.length
		? `<ul class="space-y-2">${value.documents
				.map((doc) => {
					return `<li class="rounded-md border border-border/60 bg-card/40 px-4 py-3 transition hover:border-border"><div class="flex flex-col gap-1"><a class="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/?doc=${encodeURIComponent(doc.id)}">${escapeHtml(doc.meta.title)}</a><span class="text-xs text-muted-foreground">${escapeHtml(doc.displayPath)}</span></div></li>`;
				})
				.join("")}</ul>`
		: `<div class="rounded-lg border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No documents matched this value.</div>`;

	const breadcrumbHtml = `<nav class="text-xs text-muted-foreground"><a class="underline-offset-4 hover:underline" href="/fm">Front matter</a><span class="mx-1 text-muted-foreground/70">/</span><a class="underline-offset-4 hover:underline" href="${buildFrontMatterFieldUrl(field.name)}">${escapeHtml(field.name)}</a><span class="mx-1 text-muted-foreground/70">/</span><span>${escapeHtml(value.value)}</span></nav>`;

	const mainContentHtml = `<div class="mx-auto w-full max-w-4xl px-4 py-8">
                ${mobileSelector}
                <header class="space-y-3 border-b border-border pb-6">
                        ${breadcrumbHtml}
                        <h1 class="text-3xl font-semibold tracking-tight">${escapeHtml(value.value)}</h1>
                        <p class="text-sm text-muted-foreground">Documents where <code class="rounded bg-muted px-1 py-0.5">${escapeHtml(field.name)}</code> equals <code class="rounded bg-muted px-1 py-0.5">${escapeHtml(value.value)}</code>.</p>
                </header>
                <section class="mt-8 space-y-4">
                        ${documentsHtml}
                </section>
        </div>`;

	return renderViewerPage(
		context,
		{
			pageTitle: `${field.name}: ${value.value}`,
			activeDocumentId: null,
			mainContentHtml,
		},
		{ enableHotReload: options?.enableHotReload !== false },
	);
}

function renderHeaderOptions(options: readonly ViewerHeaderOption[]): string {
	if (!options.length) {
		return "";
	}

	return options
		.map(({ label, value }) => {
			const labelText = escapeHtml(label);
			const valueText = escapeHtml(value);
			return `<span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[0.65rem] text-muted-foreground"><span class="font-semibold uppercase tracking-wide">${labelText}</span><span class="font-mono leading-none normal-case">${valueText}</span></span>`;
		})
		.join("");
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

function buildFrontMatterFieldUrl(field: string): string {
	return `/fm/${encodeURIComponent(field)}`;
}

function buildFrontMatterValueUrl(field: string, value: string): string {
	return `${buildFrontMatterFieldUrl(field)}/${encodeURIComponent(value)}`;
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

function compareViewerDocuments(a: ViewerDocument, b: ViewerDocument): number {
	const titleA = a.meta.title || "";
	const titleB = b.meta.title || "";
	const titleResult = titleA.localeCompare(titleB, undefined, {
		sensitivity: "base",
	});
	if (titleResult !== 0) {
		return titleResult;
	}

	return a.meta.routePath.localeCompare(b.meta.routePath, undefined, {
		sensitivity: "base",
	});
}

function buildFrontMatterIndex(
	documents: readonly ViewerDocument[],
): ViewerFrontMatterIndex {
	const fieldBuckets = new Map<string, Map<string, ViewerDocument[]>>();

	for (const document of documents) {
		for (const [field, rawValue] of Object.entries(document.frontMatter)) {
			const values = extractLinkableFrontMatterValues(rawValue);
			if (!values.length) {
				continue;
			}

			let valueBucket = fieldBuckets.get(field);
			if (!valueBucket) {
				valueBucket = new Map();
				fieldBuckets.set(field, valueBucket);
			}

			for (const value of values) {
				let documentsForValue = valueBucket.get(value);
				if (!documentsForValue) {
					documentsForValue = [];
					valueBucket.set(value, documentsForValue);
				}

				if (!documentsForValue.includes(document)) {
					documentsForValue.push(document);
				}
			}
		}
	}

	const fieldMap = new Map<string, ViewerFrontMatterField>();
	const fields: ViewerFrontMatterField[] = [...fieldBuckets.entries()]
		.sort((a, b) =>
			a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
		)
		.map(([name, values]) => {
			const entries: ViewerFrontMatterValue[] = [...values.entries()]
				.sort((a, b) =>
					a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
				)
				.map(([value, docs]) => ({ value, documents: [...docs] }));

			const valueMap = new Map(entries.map((entry) => [entry.value, entry]));
			const fieldEntry: ViewerFrontMatterField = {
				name,
				values: entries,
				valueMap,
			};
			fieldMap.set(name, fieldEntry);
			return fieldEntry;
		});

	return { fields, fieldMap };
}

function extractLinkableFrontMatterValues(value: unknown): string[] {
	if (value === undefined || value === null) {
		return [];
	}

	if (Array.isArray(value)) {
		const seen = new Set<string>();
		const results: string[] = [];
		for (const entry of value) {
			const coerced = coerceLinkableFrontMatterValue(entry);
			if (coerced && !seen.has(coerced)) {
				seen.add(coerced);
				results.push(coerced);
			}
		}
		return results;
	}

	const coerced = coerceLinkableFrontMatterValue(value);
	return coerced ? [coerced] : [];
}

function coerceLinkableFrontMatterValue(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (Array.isArray(value)) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "object") {
		return null;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	if (typeof value === "number" || typeof value === "bigint") {
		return value.toString();
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	return String(value);
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
	const directories: MutableDirectoryNode[] = [];
	const files: ViewerNavigationFile[] = [];

	for (const child of directory.children) {
		if (child.type === "dir") {
			sortDirectory(child);
			directories.push(child);
		} else {
			files.push(child);
		}
	}

	directories.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);

	directory.children = [...directories, ...files];
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

function renderFooter(
	document: ViewerDocument,
	context: ViewerContext,
): string {
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
                                <div class="text-sm text-foreground">${renderFooterValue(key, value, context)}</div>
                        </div>`;
		})
		.join("");

	return `<footer class="mt-12 rounded-lg border border-border bg-card/40 p-6">
		<div class="flex flex-wrap items-center justify-between gap-2 pb-4">
			<span class="text-sm font-medium text-muted-foreground">Front matter</span>
			<span class="text-xs text-muted-foreground">${escapeHtml(document.displayPath)}</span>
		</div>
                <div class="mt-4">${rows}</div>
        </footer>`;
}

function renderFooterValue(
	fieldName: string,
	value: unknown,
	context: ViewerContext,
): string {
	if (value === undefined || value === null) {
		return `<span class="text-muted-foreground">—</span>`;
	}

	if (Array.isArray(value)) {
		if (!value.length) {
			return `<span class="text-muted-foreground">—</span>`;
		}
		return value
			.map((entry) => renderFooterValue(fieldName, entry, context))
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

	const displayValue = formatFooterPrimitive(value);
	const linkTarget = buildFrontMatterLink(context, fieldName, value);

	if (linkTarget) {
		return `<a class="text-primary underline-offset-4 hover:underline" href="${linkTarget}">${escapeHtml(displayValue)}</a>`;
	}

	return escapeHtml(displayValue);
}

function formatFooterPrimitive(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	if (typeof value === "number" || typeof value === "bigint") {
		return value.toString();
	}

	return String(value);
}

function buildFrontMatterLink(
	context: ViewerContext,
	fieldName: string,
	value: unknown,
): string | null {
	const normalized = coerceLinkableFrontMatterValue(value);
	if (!normalized) {
		return null;
	}

	const field = context.frontMatterIndex.fieldMap.get(fieldName);
	const entry = field?.valueMap.get(normalized);
	if (!field || !entry || entry.documents.length === 0) {
		return null;
	}

	return buildFrontMatterValueUrl(field.name, entry.value);
}

function renderMobileSelector(
	context: ViewerContext,
	activeId: string,
): string {
	if (!context.documents.length) {
		return "";
	}

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
