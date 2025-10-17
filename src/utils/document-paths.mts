import path from "node:path";
import { MdfError } from "../errors.mts";
import { resolveFilterPath } from "./filters.mts";
import { formatDisplayPath } from "./path-format.mts";

export interface ResolveDocumentSlugOptions {
	frontMatter: Record<string, unknown>;
	relativePath: string;
	filePath: string;
	cwd: string;
	slugField?: string;
}

export function resolveDocumentSlug(
	options: ResolveDocumentSlugOptions,
): string {
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

	return normalizeVirtualSlugValue(raw, slugField, options.filePath, options.cwd);
}

export function buildDocumentRoutePath(
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

export function computeDirectoryRelativePath(
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

function createSlug(relativePath: string): string {
	const normalized = relativePath.replaceAll("\\", "/");
	return normalized.replace(/\.[^.]+$/u, "");
}

export function normalizeVirtualSlugValue(
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
