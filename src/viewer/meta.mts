import { resolveFilterPath } from "../utils/filters.mts";

export interface ViewerMeta {
	title: string;
	description: string | null;
	tags: string[];
	author: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	virtualPath: string;
	routePath: string;
	draft: boolean;
}

interface EntryLike {
	slug: string;
	data?: Record<string, unknown>;
}

export interface BuildViewerEntryOptions {
	virtualPathField?: string;
	virtualPathSeparator?: string;
}

const DEFAULT_FIELD_CANDIDATES: Record<string, readonly string[]> = {
	title: ["title", "name", "heading"],
	description: ["description", "summary"],
	tags: ["tags", "labels"],
	author: ["author", "owner"],
	createdAt: ["created_at", "createdAt"],
	updatedAt: ["updated_at", "updatedAt"],
};

const DEFAULT_VIRTUAL_PATH_FIELD = "vpath";
const DEFAULT_VIRTUAL_PATH_SEPARATOR = "/";

export function buildViewerEntry(entry: EntryLike): ViewerMeta {
	return buildViewerEntryFromRecord(entry.slug, entry.data ?? {}, {});
}

export function buildViewerEntryFromRecord(
	slug: string,
	data: Record<string, unknown>,
	opts: BuildViewerEntryOptions,
): ViewerMeta {
	const fieldParam = resolveVirtualPathField(opts.virtualPathField);
	const separator = resolveVirtualPathSeparator(opts.virtualPathSeparator);

	const title =
		coerceString(
			resolveByCandidates(data, getFieldCandidates("title")) ??
				relativeSlugLabel(slug),
		) ?? relativeSlugLabel(slug);

	const description = coerceString(
		resolveByCandidates(data, getFieldCandidates("description")),
	);

	const tags = coerceStringArray(
		resolveByCandidates(data, getFieldCandidates("tags")),
	);

	const author = coerceString(
		resolveByCandidates(data, getFieldCandidates("author")),
	);

	const createdAt = coerceString(
		resolveByCandidates(data, getFieldCandidates("createdAt")),
	);

	const updatedAt = coerceString(
		resolveByCandidates(data, getFieldCandidates("updatedAt")),
	);

	const rawVirtualPath = resolveByCandidates(data, [fieldParam]);
	const coercedVirtualPath = coerceString(rawVirtualPath);
	const virtualPath = coercedVirtualPath ?? slug;
	const virtualSegments = splitVirtualPath(virtualPath, separator);
	let routePath: string;
	if (virtualSegments.length > 0) {
		routePath = virtualSegments.join("/");
	} else {
		const normalized = coercedVirtualPath?.trim();
		if (normalized && normalized.length > 0) {
			routePath = normalized;
		} else {
			routePath = slugSegments(slug).join("/");
		}
	}

	const draftValue = resolveByCandidates(data, ["draft"]);
	const draft = coerceBoolean(draftValue);

	return {
		title,
		description,
		tags,
		author,
		createdAt,
		updatedAt,
		virtualPath,
		routePath: routePath || slug,
		draft,
	};
}

function getFieldCandidates(
	key: keyof typeof DEFAULT_FIELD_CANDIDATES,
): readonly string[] {
	const envKey = `MDF_VIEWER_FIELD_${key.toUpperCase()}`;
	const override = process.env[envKey];
	if (!override) {
		return DEFAULT_FIELD_CANDIDATES[key];
	}

	return override
		.split(/\s+/u)
		.map((candidate) => candidate.trim())
		.filter((candidate) => candidate.length > 0);
}

function resolveByCandidates(
	data: Record<string, unknown>,
	candidates: readonly string[],
): unknown {
	for (const candidate of candidates) {
		if (!candidate) {
			continue;
		}
		const segments = candidate.split(".").map((segment) => segment.trim());
		const value = resolveFilterPath(data, segments);
		if (value !== undefined && value !== null) {
			return value;
		}
	}
	return undefined;
}

function coerceString(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	if (typeof value === "number" || typeof value === "bigint") {
		return value.toString();
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	return String(value);
}

function coerceStringArray(value: unknown): string[] {
	if (value === undefined || value === null) {
		return [];
	}

	if (Array.isArray(value)) {
		return value
			.map((entry) => coerceString(entry))
			.filter(
				(entry): entry is string =>
					typeof entry === "string" && entry.length > 0,
			);
	}

	const asString = coerceString(value);
	return asString ? [asString] : [];
}

function coerceBoolean(value: unknown): boolean {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true" || normalized === "1" || normalized === "yes") {
			return true;
		}
		if (normalized === "false" || normalized === "0" || normalized === "no") {
			return false;
		}
	}

	if (typeof value === "number") {
		return value !== 0;
	}

	return Boolean(value);
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

function slugSegments(slug: string): string[] {
	return slug
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function relativeSlugLabel(slug: string): string {
	const segments = slugSegments(slug);
	if (!segments.length) {
		return slug || "Document";
	}
	return segments[segments.length - 1] ?? slug;
}

function resolveVirtualPathField(option?: string): string {
	if (option && option.trim().length > 0) {
		return option.trim();
	}
	const envOverride = process.env.MDF_VIRTUAL_PATH_PARAM?.trim();
	if (envOverride) {
		return envOverride;
	}
	return DEFAULT_VIRTUAL_PATH_FIELD;
}

function resolveVirtualPathSeparator(option?: string): string {
	if (option && option.trim().length > 0) {
		return option.trim();
	}
	const envOverride = process.env.MDF_VIRTUAL_PATH_SEPARATOR?.trim();
	if (envOverride) {
		return envOverride;
	}
	return DEFAULT_VIRTUAL_PATH_SEPARATOR;
}
