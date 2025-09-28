import type { CollectionEntry } from "astro:content";

export interface ViewerEntryMeta {
	title: string;
	description?: string;
	tags: string[];
	author?: string;
	createdAt?: string;
	updatedAt?: string;
	virtualPath: string;
	routePath: string;
	draft: boolean;
}

const DEFAULT_FIELD_CANDIDATES: Record<string, readonly string[]> = {
	title: ["title", "name", "heading", "subject"],
	description: ["description", "summary", "subtitle", "details", "overview"],
	tags: ["tags", "labels", "topics", "categories"],
	author: ["author", "owner", "assignee", "created_by", "createdBy"],
	createdAt: [
		"created_at",
		"createdAt",
		"created",
		"created_on",
		"createdOn",
		"date",
	],
	updatedAt: [
		"updated_at",
		"updatedAt",
		"updated",
		"updated_on",
		"updatedOn",
		"modified",
		"modified_at",
		"modifiedAt",
	],
};

const ENV_FIELD_PREFIX = "MDF_VIEWER_FIELD_";

export function buildViewerEntry(
	entry: CollectionEntry<"pages">,
): ViewerEntryMeta {
	const data = entry.data as Record<string, unknown>;
	const entries = Object.entries(data);
	const lookup = createLookup(entries, data);
	const separator = getVirtualPathSeparator();
	const virtualPathParam = getVirtualPathParam();

	const rawVirtualPath = resolveStringField(lookup, [
		virtualPathParam,
		"vpath",
	]);
	const displayVirtualPath =
		normalizeDisplayPath(rawVirtualPath ?? entry.slug) ||
		normalizeDisplayPath(entry.slug);
	const routeSegments = splitVirtualPath(rawVirtualPath ?? "", separator);
	const routePath = routeSegments.length
		? routeSegments.join("/")
		: normalizeDisplayPath(entry.slug) || entry.slug;

	const title =
		resolveStringField(lookup, getFieldCandidates("title"))?.trim() ||
		displayVirtualPath ||
		entry.slug;

	const description = resolveStringField(
		lookup,
		getFieldCandidates("description"),
	);

	const tags = resolveStringArrayField(lookup, getFieldCandidates("tags"));

	const author = resolveStringField(lookup, getFieldCandidates("author"));

	const createdAt = resolveStringField(lookup, getFieldCandidates("createdAt"));

	const updatedAt = resolveStringField(lookup, getFieldCandidates("updatedAt"));

	const draft = resolveBooleanField(lookup("draft")) ?? false;

	return {
		title,
		description,
		tags,
		author,
		createdAt,
		updatedAt,
		virtualPath: displayVirtualPath,
		routePath,
		draft,
	};
}

export function getVirtualPathParam(): string {
	const raw = process.env.MDF_VIRTUAL_PATH_PARAM;
	if (typeof raw === "string" && raw.trim().length > 0) {
		return raw.trim();
	}
	return "vpath";
}

export function getVirtualPathSeparator(): string {
	const raw = process.env.MDF_VIRTUAL_PATH_SEPARATOR;
	if (typeof raw === "string" && raw.trim().length > 0) {
		return raw;
	}
	return "/";
}

function getFieldCandidates(
	field: keyof typeof DEFAULT_FIELD_CANDIDATES,
): string[] {
	const envKey = `${ENV_FIELD_PREFIX}${field.toUpperCase()}`;
	const override = readEnvList(envKey);
	if (override && override.length > 0) {
		return override;
	}
	return [...DEFAULT_FIELD_CANDIDATES[field]];
}

function readEnvList(key: string): string[] | null {
	const raw = process.env[key];
	if (!raw) {
		return null;
	}

	const tokens = raw
		.split(/[,\s]+/g)
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
	return tokens.length > 0 ? tokens : null;
}

function createLookup(
	entries: [string, unknown][],
	record: Record<string, unknown>,
): (candidate: string) => unknown {
	const lowerCaseMap = new Map<string, unknown>();
	for (const [key, value] of entries) {
		lowerCaseMap.set(key.toLowerCase(), value);
	}

	return (candidate: string) => {
		if (!candidate) {
			return undefined;
		}

		if (candidate in record) {
			return record[candidate];
		}

		const normalized = candidate.toLowerCase();
		return lowerCaseMap.get(normalized);
	};
}

function resolveStringField(
	lookup: (candidate: string) => unknown,
	candidates: readonly string[],
): string | undefined {
	for (const candidate of candidates) {
		const raw = lookup(candidate);
		const value = toDisplayString(raw);
		if (value !== undefined) {
			return value;
		}
	}
	return undefined;
}

function resolveStringArrayField(
	lookup: (candidate: string) => unknown,
	candidates: readonly string[],
): string[] {
	for (const candidate of candidates) {
		const raw = lookup(candidate);
		const value = toStringArray(raw);
		if (value.length > 0) {
			return value;
		}
	}
	return [];
}

function resolveBooleanField(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") {
			return true;
		}
		if (normalized === "false") {
			return false;
		}
	}

	if (typeof value === "number") {
		if (value === 1) {
			return true;
		}
		if (value === 0) {
			return false;
		}
	}

	return undefined;
}

function toDisplayString(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	if (typeof value === "number" || typeof value === "bigint") {
		return String(value);
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	try {
		return String(value);
	} catch {
		return undefined;
	}
}

function toStringArray(value: unknown): string[] {
	if (value === undefined || value === null) {
		return [];
	}

	if (Array.isArray(value)) {
		const normalized = value
			.map((entry) => toDisplayString(entry))
			.filter((entry): entry is string => entry !== undefined);
		return normalized;
	}

	const single = toDisplayString(value);
	return single !== undefined ? [single] : [];
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

function normalizeDisplayPath(value: string): string {
	const normalized = value.trim().replace(/^\/+|\/+$/g, "");
	return normalized.length > 0 ? normalized : "";
}
