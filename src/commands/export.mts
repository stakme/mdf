import { promises as fs } from "node:fs";
import path from "node:path";
import type { InvalidFileWarning } from "../types.mts";
import {
	type MarkdownDocumentAssetReference,
	renderDocumentMarkdownWithAssets,
} from "../utils/markdown-renderer.mts";
import {
	buildViewerContextPayload,
	buildViewerDocumentPayload,
	buildViewerFrontMatterFieldPayload,
	buildViewerFrontMatterValuePayload,
	loadViewerStaticAssets,
	prepareViewerContext,
} from "./viewer.mts";

export interface ExportCommandOptions {
	cwd: string;
	directory: string;
	outputDirectory: string;
	filters?: readonly string[];
	virtualPathPrefix?: string;
	strict?: boolean;
	ignoreInvalid?: boolean;
}

export interface ExportedDocument {
	id: string;
	sourcePath: string;
	dataPath: string;
	assetPaths: string[];
}

export interface ExportCommandResult {
	exported: ExportedDocument[];
	warnings: InvalidFileWarning[];
	outputDirectory: string;
}

export async function runExportCommand(
	options: ExportCommandOptions,
): Promise<ExportCommandResult> {
	const context = await prepareViewerContext({
		cwd: options.cwd,
		directory: options.directory,
		filters: options.filters,
		virtualPathPrefix: options.virtualPathPrefix,
		strict: options.strict === true,
		ignoreInvalid: options.ignoreInvalid === true,
	});

	const staticAssets = await loadViewerStaticAssets();

	const resolvedOutputDirectory = path.resolve(
		options.cwd,
		options.outputDirectory,
	);

	await fs.rm(resolvedOutputDirectory, { recursive: true, force: true });
	await fs.mkdir(resolvedOutputDirectory, { recursive: true });
	await fs.cp(staticAssets.root, resolvedOutputDirectory, { recursive: true });

	const warnings: InvalidFileWarning[] = context.warnings.map((warning) => ({
		filePath: warning.filePath,
		messages: [...warning.messages],
	}));

	const exportedDocuments: ExportedDocument[] = [];
	const apiRoot = path.join(resolvedOutputDirectory, "api");

	await writeJson(
		path.join(apiRoot, "context", "index.json"),
		buildViewerContextPayload(context),
	);

	const frontMatterFields = context.frontMatterIndex.fields.map((field) =>
		buildViewerFrontMatterFieldPayload(field),
	);
	await writeJson(path.join(apiRoot, "front-matter", "index.json"), {
		fields: frontMatterFields,
	});

	for (
		let index = 0;
		index < context.frontMatterIndex.fields.length;
		index += 1
	) {
		const field = context.frontMatterIndex.fields[index];
		const fieldPayload = frontMatterFields[index];
		const fieldPath = await writeFrontMatterField(
			apiRoot,
			fieldPayload,
			warnings,
			context.directory,
		);

		if (!fieldPath) {
			continue;
		}

		for (const value of field.values) {
			const valuePayload = buildViewerFrontMatterValuePayload(value);
			await writeFrontMatterValue(
				fieldPath,
				field.name,
				valuePayload,
				warnings,
				context.directory,
			);
		}
	}

	for (const document of context.documents) {
		const documentPayload = buildViewerDocumentPayload(document);
		const documentDataPath = path.join(
			apiRoot,
			"documents",
			document.id,
			"index.json",
		);
		await writeJson(documentDataPath, documentPayload);

		const assets = collectDocumentAssets(
			document.markdown,
			document.meta.title ?? null,
			document.id,
		);
		const copiedAssets = await exportDocumentAssets(
			document.filePath,
			document.id,
			assets,
			context.directory,
			resolvedOutputDirectory,
			warnings,
		);

		exportedDocuments.push({
			id: document.id,
			sourcePath: document.filePath,
			dataPath: documentDataPath,
			assetPaths: copiedAssets,
		});
	}

	return {
		exported: exportedDocuments,
		warnings,
		outputDirectory: resolvedOutputDirectory,
	};
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const json = JSON.stringify(data, null, 2);
	await fs.writeFile(filePath, `${json}\n`, "utf8");
}

async function writeFrontMatterField(
	apiRoot: string,
	fieldPayload: ReturnType<typeof buildViewerFrontMatterFieldPayload>,
	warnings: InvalidFileWarning[],
	directory: string,
): Promise<string | null> {
	const segments = toSafePathSegments(fieldPayload.name);
	if (!segments) {
		warnings.push({
			filePath: directory,
			messages: [
				`Could not export front matter field "${fieldPayload.name}" because its name contains unsupported path segments.`,
			],
		});
		return null;
	}

	const fieldDirectory = path.join(apiRoot, "front-matter", ...segments);
	await writeJson(path.join(fieldDirectory, "index.json"), fieldPayload);
	return fieldDirectory;
}

async function writeFrontMatterValue(
	fieldDirectory: string,
	fieldName: string,
	value: ReturnType<typeof buildViewerFrontMatterValuePayload>,
	warnings: InvalidFileWarning[],
	directory: string,
): Promise<void> {
	const segments = toSafePathSegments(value.value);
	if (!segments) {
		warnings.push({
			filePath: directory,
			messages: [
				`Could not export front matter value "${value.value}" for field "${fieldName}" because it contains unsupported path segments.`,
			],
		});
		return;
	}

	const valueDirectory = path.join(fieldDirectory, ...segments);
	await writeJson(path.join(valueDirectory, "index.json"), {
		field: fieldName,
		...value,
	});
}

function collectDocumentAssets(
	markdown: string,
	title: string | null,
	documentId: string,
): MarkdownDocumentAssetReference[] {
	const { assets } = renderDocumentMarkdownWithAssets(markdown, title, {
		assetBaseUrl: buildDocumentAssetBaseUrl(documentId),
	});
	return assets;
}

async function exportDocumentAssets(
	documentPath: string,
	documentId: string,
	assets: readonly MarkdownDocumentAssetReference[],
	collectionRoot: string,
	outputRoot: string,
	warnings: InvalidFileWarning[],
): Promise<string[]> {
	const copied = new Map<string, string>();
	const documentOutputRoot = path.join(outputRoot, "documents", documentId);
	const documentAssetsRoot = path.join(documentOutputRoot, "assets");

	for (const asset of assets) {
		const resolvedSource = resolveDocumentAssetPath(
			documentPath,
			asset.originalPath,
			collectionRoot,
		);
		if (!resolvedSource) {
			addAssetWarning(
				warnings,
				documentPath,
				`Skipped asset "${asset.originalPath}" because it resolves outside of the collection directory.`,
			);
			continue;
		}

		let stats;
		try {
			stats = await fs.stat(resolvedSource);
		} catch (error) {
			addAssetWarning(
				warnings,
				documentPath,
				`Failed to access asset "${asset.originalPath}": ${formatAccessError(error)}`,
			);
			continue;
		}

		if (!stats.isFile()) {
			addAssetWarning(
				warnings,
				documentPath,
				`Asset "${asset.originalPath}" is not a file.`,
			);
			continue;
		}

		const targetPath = path.resolve(documentAssetsRoot, asset.encodedPath);
		if (!isPathWithinRoot(targetPath, documentOutputRoot)) {
			addAssetWarning(
				warnings,
				documentPath,
				`Skipping asset "${asset.originalPath}" because the rewritten path escapes the export directory.`,
			);
			continue;
		}

		if (copied.has(targetPath)) {
			continue;
		}

		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.copyFile(resolvedSource, targetPath);
		copied.set(targetPath, resolvedSource);
	}

	return [...copied.keys()].sort();
}

function toSafePathSegments(value: string): string[] | null {
	const segments = value.split("/");
	if (segments.length === 0) {
		return ["_"];
	}

	const safe: string[] = [];
	for (const segment of segments) {
		if (!segment) {
			return null;
		}
		if (segment === "." || segment === "..") {
			return null;
		}
		safe.push(segment);
	}
	return safe;
}

function resolveDocumentAssetPath(
	documentPath: string,
	assetPath: string,
	rootDirectory: string,
): string | null {
	const documentDirectory = path.dirname(documentPath);
	const normalizedRequest = assetPath.replace(/\\/gu, "/");
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

function addAssetWarning(
	warnings: InvalidFileWarning[],
	documentPath: string,
	message: string,
): void {
	const existing = warnings.find((entry) => entry.filePath === documentPath);
	if (existing) {
		existing.messages.push(message);
	} else {
		warnings.push({
			filePath: documentPath,
			messages: [message],
		});
	}
}

function formatAccessError(error: unknown): string {
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		return typeof message === "string" ? message : String(message);
	}
	return String(error);
}

function buildDocumentAssetBaseUrl(documentId: string): string {
	return `/documents/${encodeURIComponent(documentId)}/assets/`;
}
