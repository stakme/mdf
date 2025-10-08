import type { FSWatcher } from "node:fs";
import { promises as fs, watch as watchDirectory } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ServerType, serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";
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
	resolveFilterPath,
} from "../utils/filters.mts";
import { logInvalidFileWarnings } from "../utils/invalid-file-warning.mts";
import { renderDocumentMarkdown } from "../utils/markdown-renderer.mts";
import {
	formatDisplayPath,
	formatRelativePath,
} from "../utils/path-format.mts";
import { buildViewerEntryFromRecord } from "../viewer/meta.mts";
import { buildNavigationTree } from "../viewer/navigation.mts";
import type {
	ViewerCommandOptions,
	ViewerContext,
	ViewerContextPayload,
	ViewerDocument,
	ViewerDocumentPayload,
	ViewerDocumentSummary,
	ViewerFrontMatterField,
	ViewerFrontMatterFieldPayload,
	ViewerFrontMatterIndex,
	ViewerFrontMatterValue,
	ViewerFrontMatterValuePayload,
	ViewerHeaderOption,
} from "../viewer/types.mts";

export type {
	ViewerCommandOptions,
	ViewerContext,
	ViewerContextPayload,
	ViewerDocument,
	ViewerDocumentPayload,
	ViewerDocumentSummary,
	ViewerFrontMatterField,
	ViewerFrontMatterFieldPayload,
	ViewerFrontMatterIndex,
	ViewerFrontMatterValue,
	ViewerFrontMatterValuePayload,
	ViewerHeaderOption,
	ViewerNavigationDirectory,
	ViewerNavigationFile,
} from "../viewer/types.mts";

interface ViewerDocumentEntry {
	schema: LoadedSchema;
	frontMatter: ViewerDocument["frontMatter"];
	document: ViewerDocument;
}

interface PrepareViewerContextOptions extends ViewerCommandOptions {}

export async function runViewerCommand(
	options: ViewerCommandOptions,
): Promise<void> {
	let context = await prepareViewerContext(options);
	logInvalidFileWarnings(context.warnings, options.cwd);
	const appControls = await createViewerApp(() => context, {
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

		const workspaceRelativePath = formatRelativePath(filePath, options.cwd);
		const directoryRelativePath = computeDirectoryRelativePath(
			filePath,
			resolvedDirectory,
		);
		const slug = resolveDocumentSlug({
			frontMatter,
			relativePath: directoryRelativePath,
			filePath,
			cwd: options.cwd,
			slugField: config.virtualSlug?.param,
		});
		const meta = buildViewerEntryFromRecord(slug, frontMatter, {
			virtualPathField: virtualPathConfig.param,
			virtualPathSeparator: separator,
		});
		const routePath = config.virtualSlug
			? slug
			: buildDocumentRoutePath(filePath, resolvedDirectory);

		const id = encodeDocumentId(directoryRelativePath);
		const html = renderDocumentMarkdown(document.body, meta.title, {
			assetBaseUrl: buildDocumentAssetBaseUrl(id),
		});
		const navigationSegments = buildNavigationSegments({
			virtualSegments: segments,
			rawVirtualPath,
			slug,
			filePath,
			rootDirectory: resolvedDirectory,
		});

		const schemaEntry = config.getSchemaForRelativePath(workspaceRelativePath);

		const sanitizedFrontMatter = sanitizeViewerFrontMatter(
			frontMatter,
			virtualPathConfig.param,
			config.virtualSlug?.param,
			schemaEntry.visibleFields,
		);
		const visibleFields = schemaEntry.visibleFields
			? [...schemaEntry.visibleFields]
			: null;

		const viewerDocument: ViewerDocument = {
			id,
			filePath,
			displayPath: formatDisplayPath(filePath, options.cwd),
			relativePath: directoryRelativePath,
			slug,
			meta: {
				...meta,
				virtualPath: rawVirtualPath ?? meta.virtualPath,
				routePath,
			},
			frontMatter: sanitizedFrontMatter,
			visibleFields,
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
	const documentOrder = new Map(
		documents.map((doc, index) => [doc.id, index] as const),
	);
	const navigation = buildNavigationTree(documents, (left, right) => {
		const leftOrder = documentOrder.get(left.id) ?? 0;
		const rightOrder = documentOrder.get(right.id) ?? 0;
		return leftOrder - rightOrder;
	});
	const documentMap = new Map(documents.map((doc) => [doc.id, doc]));
	const defaultDocument = documents[0] ?? null;
	const frontMatterIndex = buildFrontMatterIndex(
		documents,
		virtualPathConfig.param,
	);

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

interface ViewerStaticAssets {
	root: string;
	indexHtml: string;
}

interface StaticFileCacheEntry {
	data: ArrayBuffer;
	contentType: string;
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

export async function createViewerApp(
	getContext: () => ViewerContext,
	options?: { accessLog?: boolean; enableHotReload?: boolean },
): Promise<ViewerAppControls> {
	const staticAssets = await loadViewerStaticAssets();
	const assetCache = new Map<string, StaticFileCacheEntry>();
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

	const handleContextRequest = (c: Context) => {
		const context = getContext();
		return c.json(buildViewerContextPayload(context));
	};

	app.get("/api/context", handleContextRequest);
	app.get("/api/context/index.json", handleContextRequest);

	const handleDocumentRequest = (c: Context) => {
		const context = getContext();
		const document = context.documentMap.get(c.req.param("id"));
		if (!document) {
			return c.json({ error: "Not Found" }, 404);
		}

		return c.json(buildViewerDocumentPayload(document));
	};

	app.get("/api/documents/:id", handleDocumentRequest);
	app.get("/api/documents/:id/index.json", handleDocumentRequest);

	const handleFrontMatterIndexRequest = (c: Context) => {
		const context = getContext();
		return c.json({
			fields: context.frontMatterIndex.fields.map((field) =>
				buildViewerFrontMatterFieldPayload(field),
			),
		});
	};

	app.get("/api/front-matter", handleFrontMatterIndexRequest);
	app.get("/api/front-matter/index.json", handleFrontMatterIndexRequest);

	const handleFrontMatterFieldRequest = (c: Context) => {
		const context = getContext();
		const fieldName = c.req.param("field");
		const field = context.frontMatterIndex.fieldMap.get(fieldName);
		if (!field) {
			return c.json({ error: "Not Found" }, 404);
		}

		return c.json(buildViewerFrontMatterFieldPayload(field));
	};

	app.get("/api/front-matter/:field", handleFrontMatterFieldRequest);
	app.get("/api/front-matter/:field/index.json", handleFrontMatterFieldRequest);

	const handleFrontMatterValueRequest = (c: Context) => {
		const context = getContext();
		const fieldName = c.req.param("field");
		const valueKey = c.req.param("value");
		const field = context.frontMatterIndex.fieldMap.get(fieldName);
		const valueEntry = field?.valueMap.get(valueKey);
		if (!field || !valueEntry) {
			return c.json({ error: "Not Found" }, 404);
		}

		return c.json({
			field: field.name,
			...buildViewerFrontMatterValuePayload(valueEntry),
		});
	};

	app.get("/api/front-matter/:field/:value", handleFrontMatterValueRequest);
	app.get(
		"/api/front-matter/:field/:value/index.json",
		handleFrontMatterValueRequest,
	);

	app.get("/documents/:id/assets/:assetPath{.+}", async (c) => {
		const context = getContext();
		const document = context.documentMap.get(c.req.param("id"));
		if (!document) {
			return c.json({ error: "Not Found" }, 404);
		}

		const requestedPath = c.req.param("assetPath") ?? "";
		const resolvedPath = resolveDocumentAssetPath(
			document.filePath,
			requestedPath,
			context.directory,
		);
		if (!resolvedPath) {
			return c.json({ error: "Not Found" }, 404);
		}

		try {
			const buffer = await fs.readFile(resolvedPath);
			const contentType = determineContentType(resolvedPath);
			return c.newResponse(toArrayBuffer(buffer), 200, {
				"Content-Type": contentType,
			});
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | undefined)?.code;
			if (code === "ENOENT" || code === "EISDIR") {
				return c.json({ error: "Not Found" }, 404);
			}
			throw error;
		}
	});

	app.get("/assets/:assetPath{.+}", async (c) => {
		const requested = c.req.param("assetPath") ?? "";
		const resolved = await resolveViewerAssetPath(
			staticAssets.root,
			`assets/${requested}`,
		);
		if (!resolved) {
			return c.json({ error: "Not Found" }, 404);
		}

		return serveStaticAsset(c, resolved, assetCache);
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

	app.get("*", (c) => {
		return c.newResponse(staticAssets.indexHtml, 200, {
			"Content-Type": "text/html; charset=utf-8",
		});
	});

	return { app, notifyReload: broadcastReload };
}

export function buildViewerContextPayload(
	context: ViewerContext,
): ViewerContextPayload {
	return {
		directoryLabel: context.directoryLabel,
		headerOptions: context.headerOptions.map((option) => ({ ...option })),
		navigation: context.navigation,
		documents: context.documents.map((doc) => buildViewerDocumentSummary(doc)),
		defaultDocumentId: context.defaultDocument?.id ?? null,
		frontMatter: context.frontMatterIndex.fields.map((field) =>
			buildViewerFrontMatterFieldPayload(field),
		),
		virtualPath: {
			param: context.virtualPathParam,
			separator: context.virtualPathSeparator,
		},
		warnings: context.warnings.map((warning) => ({
			filePath: warning.filePath,
			messages: [...warning.messages],
		})),
	};
}

export function buildViewerDocumentPayload(
	document: ViewerDocument,
): ViewerDocumentPayload {
	return {
		...buildViewerDocumentSummary(document),
		frontMatter: document.frontMatter,
		visibleFields: document.visibleFields ? [...document.visibleFields] : null,
		html: document.html,
		markdown: document.markdown,
	};
}

function buildViewerDocumentSummary(
	document: ViewerDocument,
): ViewerDocumentSummary {
	return {
		id: document.id,
		slug: document.slug,
		displayPath: document.displayPath,
		relativePath: document.relativePath,
		meta: document.meta,
	};
}

export function buildViewerFrontMatterFieldPayload(
	field: ViewerFrontMatterField,
): ViewerFrontMatterFieldPayload {
	return {
		name: field.name,
		values: field.values.map((value) =>
			buildViewerFrontMatterValuePayload(value),
		),
	};
}

export function buildViewerFrontMatterValuePayload(
	value: ViewerFrontMatterValue,
): ViewerFrontMatterValuePayload {
	const documents = value.documents.map((doc) =>
		buildViewerDocumentSummary(doc),
	);
	return {
		value: value.value,
		documentIds: documents.map((doc) => doc.id),
		documentCount: documents.length,
		documents,
	};
}

export async function loadViewerStaticAssets(): Promise<ViewerStaticAssets> {
	const root = await resolveViewerStaticRoot();
	const indexPath = path.join(root, "index.html");

	try {
		const indexHtml = await fs.readFile(indexPath, "utf8");
		return { root, indexHtml };
	} catch {
		throw new MdfError(
			"VIEWER_ASSETS_MISSING",
			"Viewer assets were not found. Run `npm run viewer:build` before launching the viewer.",
		);
	}
}

async function resolveViewerStaticRoot(): Promise<string> {
	const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = await resolvePackageRoot(moduleDirectory);
	const searchRoots = new Set<string>();
	if (repoRoot) {
		searchRoots.add(repoRoot);
	}
	searchRoots.add(path.resolve(moduleDirectory, ".."));
	searchRoots.add(moduleDirectory);

	const candidates = new Set<string>();
	for (const root of searchRoots) {
		candidates.add(path.resolve(root, "dist", "viewer"));
		candidates.add(path.resolve(root, "viewer"));
		candidates.add(path.resolve(root, "viewer-app", "dist"));
	}

	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	throw new MdfError(
		"VIEWER_ASSETS_NOT_BUILT",
		"Viewer assets are missing. Build them with `npm run viewer:build`.",
	);
}

async function resolvePackageRoot(start: string): Promise<string | null> {
	let current = path.resolve(start);
	for (let depth = 0; depth < 6; depth += 1) {
		const candidate = path.join(current, "package.json");
		if (await pathExists(candidate)) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return null;
}

async function resolveViewerAssetPath(
	root: string,
	requestPath: string,
): Promise<string | null> {
	const normalized = requestPath.replace(/\+/gu, "/");
	const safeSegments = normalized
		.split("/")
		.filter((segment) => segment && segment !== ".")
		.map((segment) =>
			segment === ".." ? segment : decodeURIComponent(segment),
		);
	const resolved = path.resolve(root, ...safeSegments);
	if (!isPathWithinRoot(resolved, root)) {
		return null;
	}

	try {
		const stats = await fs.stat(resolved);
		if (!stats.isFile()) {
			return null;
		}
		return resolved;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function serveStaticAsset(
	c: Context,
	filePath: string,
	cache: Map<string, StaticFileCacheEntry>,
): Promise<Response> {
	let entry = cache.get(filePath);
	if (!entry) {
		const buffer = await fs.readFile(filePath);
		entry = {
			data: toArrayBuffer(buffer),
			contentType: determineViewerAssetContentType(filePath),
		};
		cache.set(filePath, entry);
	}

	return c.newResponse(entry.data, 200, {
		"Content-Type": entry.contentType,
		"Cache-Control": "no-cache",
	});
}

function determineViewerAssetContentType(filePath: string): string {
	switch (path.extname(filePath).toLowerCase()) {
		case ".js":
		case ".mjs":
		case ".cjs":
			return "text/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".html":
			return "text/html; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		case ".svg":
			return "image/svg+xml";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		case ".avif":
			return "image/avif";
		case ".ico":
			return "image/x-icon";
		case ".woff":
			return "font/woff";
		case ".woff2":
			return "font/woff2";
		case ".ttf":
			return "font/ttf";
		case ".map":
			return "application/json; charset=utf-8";
		default:
			return "application/octet-stream";
	}
}

async function pathExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(view.byteLength);
	copy.set(view);
	return copy.buffer;
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

interface BuildNavigationSegmentsOptions {
	virtualSegments: string[];
	rawVirtualPath: string | null;
	slug: string;
	filePath: string;
	rootDirectory: string;
}

function buildNavigationSegments(
	options: BuildNavigationSegmentsOptions,
): string[] {
	const { virtualSegments, rawVirtualPath, slug } = options;
	if (virtualSegments.length > 0) {
		const segments = [...virtualSegments];
		const leaf = deriveSlugLeaf(slug);
		const last = segments.at(-1);
		if (leaf.length > 0 && !stringsEqualIgnoreCase(last, leaf)) {
			segments.push(leaf);
		}
		return segments;
	}

	if (rawVirtualPath !== null) {
		return [];
	}

	return buildDefaultNavigationSegments(
		options.filePath,
		options.rootDirectory,
	);
}

function buildDefaultNavigationSegments(
	filePath: string,
	rootDirectory: string,
): string[] {
	const relativeToRoot = path.relative(rootDirectory, filePath);
	const normalized = relativeToRoot.replaceAll("\\", "/");
	const withoutExtension = normalized.replace(/\.[^.]+$/u, "");
	return withoutExtension
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function deriveSlugLeaf(slug: string): string {
	const segments = slugSegments(slug);
	return segments.at(-1) ?? slug;
}

function slugSegments(slug: string): string[] {
	return slug
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function stringsEqualIgnoreCase(a: string | undefined, b: string): boolean {
	if (a === undefined) {
		return false;
	}
	return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
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

interface ResolveDocumentSlugOptions {
	frontMatter: Record<string, unknown>;
	relativePath: string;
	filePath: string;
	cwd: string;
	slugField?: string;
}

function resolveDocumentSlug(options: ResolveDocumentSlugOptions): string {
	const fallback = createSlug(options.relativePath);
	const slugField = options.slugField?.trim();
	if (!slugField) {
		return fallback;
	}

	const slugSegments = slugField
		.split(".")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);

	if (slugSegments.length === 0) {
		return fallback;
	}

	const raw = resolveFilterPath(options.frontMatter, slugSegments);
	if (raw === undefined || raw === null) {
		return fallback;
	}

	if (typeof raw !== "string") {
		throw new MdfError(
			"INVALID_VIRTUAL_SLUG_VALUE",
			`Front matter field "${slugField}" must be a string in ${formatDisplayPath(options.filePath, options.cwd)}`,
		);
	}

	return normalizeSlugFieldValue(raw, slugField, options.filePath, options.cwd);
}

function normalizeSlugFieldValue(
	raw: string,
	fieldName: string,
	filePath: string,
	cwd: string,
): string {
	const normalized = raw.replace(/\\/gu, "/").trim();
	if (!normalized) {
		throw new MdfError(
			"INVALID_VIRTUAL_SLUG_VALUE",
			`Front matter field "${fieldName}" must be a non-empty string in ${formatDisplayPath(filePath, cwd)}`,
		);
	}

	const segments = normalized
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);

	if (segments.length === 0) {
		if (normalized === "/") {
			return "/";
		}

		throw new MdfError(
			"INVALID_VIRTUAL_SLUG_VALUE",
			`Front matter field "${fieldName}" must be a non-empty string in ${formatDisplayPath(filePath, cwd)}`,
		);
	}

	for (const segment of segments) {
		if (segment === "." || segment === "..") {
			throw new MdfError(
				"INVALID_VIRTUAL_SLUG_VALUE",
				`Front matter field "${fieldName}" cannot contain "." or ".." segments in ${formatDisplayPath(filePath, cwd)}`,
			);
		}
	}

	return segments.join("/");
}

function computeDirectoryRelativePath(
	filePath: string,
	rootDirectory: string,
): string {
	const relative =
		path.relative(rootDirectory, filePath) || path.basename(filePath);
	let normalized = relative.replaceAll("\\", "/");
	while (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	return normalized;
}

function buildDocumentRoutePath(
	filePath: string,
	rootDirectory: string,
): string {
	const relativeToRoot = path.relative(rootDirectory, filePath);
	const normalized = relativeToRoot.replaceAll("\\", "/");
	const withoutExtension = normalized.replace(/\.[^.]+$/u, "");
	const trimmed = withoutExtension.trim();
	if (!trimmed) {
		const fallback = path.basename(filePath, path.extname(filePath));
		return fallback.trim() || "/";
	}
	return trimmed;
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

function sanitizeViewerFrontMatter(
	frontMatter: Record<string, unknown>,
	virtualPathField: string,
	slugField: string | undefined,
	visibleFields?: readonly string[],
): Record<string, unknown> {
	const pathSegments = virtualPathField
		.split(".")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);

	const slugSegments = slugField
		? slugField
				.split(".")
				.map((segment) => segment.trim())
				.filter((segment) => segment.length > 0)
		: [];

	const enforceVisibility = visibleFields !== undefined;
	const visibleSet = new Set(
		(visibleFields ?? [])
			.map((field) => field.trim())
			.filter((field) => field.length > 0),
	);

	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(frontMatter)) {
		if (enforceVisibility && !visibleSet.has(key)) {
			continue;
		}
		if (pathSegments.length === 1 && key === pathSegments[0]) {
			continue;
		}
		if (slugSegments.length === 1 && key === slugSegments[0]) {
			continue;
		}

		const cloned = cloneFrontMatterValue(value);
		if (!isVisibleFrontMatterValue(cloned)) {
			continue;
		}

		sanitized[key] = cloned;
	}

	if (pathSegments.length === 1) {
		sanitized[pathSegments[0]] = undefined;
		delete sanitized[pathSegments[0]];
	} else if (pathSegments.length > 1) {
		removeNestedPath(sanitized, pathSegments);
	}

	for (const key of Object.keys(sanitized)) {
		if (!isVisibleFrontMatterValue(sanitized[key])) {
			delete sanitized[key];
		}
	}

	return sanitized;
}

function cloneFrontMatterValue(value: unknown): unknown {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed;
	}

	if (Array.isArray(value)) {
		return value
			.map((entry) => cloneFrontMatterValue(entry))
			.filter((entry) => isVisibleFrontMatterValue(entry));
	}

	if (isPlainRecord(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			const cloned = cloneFrontMatterValue(nested);
			if (!isVisibleFrontMatterValue(cloned)) {
				continue;
			}
			result[key] = cloned;
		}
		return result;
	}

	return value;
}

function isVisibleFrontMatterValue(value: unknown): boolean {
	if (value === undefined || value === null) {
		return false;
	}

	if (typeof value === "boolean") {
		return value === true;
	}

	if (typeof value === "string") {
		return value.trim().length > 0;
	}

	if (Array.isArray(value)) {
		return value.some((entry) => isVisibleFrontMatterValue(entry));
	}

	if (isPlainRecord(value)) {
		return Object.values(value).some((entry) =>
			isVisibleFrontMatterValue(entry),
		);
	}

	return true;
}

function removeNestedPath(
	target: Record<string, unknown>,
	segments: readonly string[],
): void {
	if (segments.length === 0) {
		return;
	}

	const [head, ...rest] = segments;
	if (head === undefined) {
		return;
	}

	const current = target[head];
	if (current === undefined) {
		return;
	}

	if (rest.length === 0) {
		delete target[head];
		return;
	}

	if (!isPlainRecord(current)) {
		return;
	}

	removeNestedPath(current, rest);

	if (Object.keys(current).length === 0) {
		delete target[head];
	}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!(value instanceof Date)
	);
}

function buildFrontMatterIndex(
	documents: readonly ViewerDocument[],
	virtualPathField: string,
): ViewerFrontMatterIndex {
	const fieldBuckets = new Map<string, Map<string, ViewerDocument[]>>();

	for (const document of documents) {
		if (virtualPathField.length > 0) {
			addFrontMatterValue(
				fieldBuckets,
				virtualPathField,
				document.meta.virtualPath,
				document,
			);
		}

		for (const [field, rawValue] of Object.entries(document.frontMatter)) {
			addFrontMatterValue(fieldBuckets, field, rawValue, document);
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

function addFrontMatterValue(
	buckets: Map<string, Map<string, ViewerDocument[]>>,
	field: string,
	rawValue: unknown,
	document: ViewerDocument,
): void {
	if (!field || field.trim().length === 0) {
		return;
	}

	const values = extractLinkableFrontMatterValues(rawValue);
	if (!values.length) {
		return;
	}

	let valueBucket = buckets.get(field);
	if (!valueBucket) {
		valueBucket = new Map();
		buckets.set(field, valueBucket);
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
