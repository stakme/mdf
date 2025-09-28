export type ViewerFilterOperator = "exact" | "loose" | "prefix" | "suffix";

export interface ViewerFilter {
	path: string[];
	operator: ViewerFilterOperator;
	value: unknown;
}

const viewerFilters: ViewerFilter[] = loadFiltersFromEnv();

export function getViewerFilters(): readonly ViewerFilter[] {
	return viewerFilters;
}

export function entryMatchesViewerFilters(
	frontMatter: Record<string, unknown>,
): boolean {
	if (viewerFilters.length === 0) {
		return true;
	}

	return viewerFilters.every((filter) => matchesFilter(frontMatter, filter));
}

function loadFiltersFromEnv(): ViewerFilter[] {
	const raw = process.env.MDF_FILTERS;
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.map(normalizeFilter)
			.filter((filter): filter is ViewerFilter => filter !== null);
	} catch {
		return [];
	}
}

function normalizeFilter(value: unknown): ViewerFilter | null {
	if (!isRecord(value)) {
		return null;
	}

	if (!Array.isArray(value.path)) {
		return null;
	}

	const path = value.path
		.map((segment) => (typeof segment === "string" ? segment.trim() : ""))
		.filter((segment) => segment.length > 0);
	if (path.length === 0) {
		return null;
	}

	const operator = normalizeOperator(value.operator);
	if (!operator) {
		return null;
	}

	return {
		path,
		operator,
		value: value.value,
	};
}

function normalizeOperator(raw: unknown): ViewerFilterOperator | null {
	if (
		raw === "exact" ||
		raw === "loose" ||
		raw === "prefix" ||
		raw === "suffix"
	) {
		return raw;
	}
	return null;
}

function matchesFilter(
	source: Record<string, unknown>,
	filter: ViewerFilter,
): boolean {
	const value = resolveFilterPath(source, filter.path);
	if (value === undefined) {
		return false;
	}

	if (Array.isArray(value)) {
		return value.some((entry) =>
			compareValues(entry, filter.value, filter.operator),
		);
	}

	return compareValues(value, filter.value, filter.operator);
}

function resolveFilterPath(
	source: Record<string, unknown>,
	pathParts: readonly string[],
): unknown {
	let current: unknown = source;
	for (const segment of pathParts) {
		if (!segment) {
			return undefined;
		}
		if (!isRecord(current)) {
			return undefined;
		}
		current = current[segment];
	}
	return current;
}

function compareValues(
	candidate: unknown,
	expected: unknown,
	operator: ViewerFilterOperator,
): boolean {
	if (candidate === undefined || candidate === null) {
		return false;
	}

	if (operator === "exact") {
		if (candidate === expected) {
			return true;
		}

		if (typeof candidate === "string" && typeof expected === "string") {
			return candidate.toLowerCase() === expected.toLowerCase();
		}

		return false;
	}

	const candidateString = toComparableString(candidate);
	const expectedString = toComparableString(expected);
	if (candidateString === null || expectedString === null) {
		return false;
	}

	const normalizedCandidate = candidateString.toLowerCase();
	const normalizedExpected = expectedString.toLowerCase();

	switch (operator) {
		case "loose":
			return normalizedCandidate.includes(normalizedExpected);
		case "prefix":
			return normalizedCandidate.startsWith(normalizedExpected);
		case "suffix":
			return normalizedCandidate.endsWith(normalizedExpected);
		default:
			return false;
	}
}

function toComparableString(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
