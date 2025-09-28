import type { FilterOperator, ParsedFilter } from "../utils/filters.mts";
import { matchesParsedFilter } from "../utils/filters.mts";

export function getViewerFilters(): ParsedFilter[] {
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
			.filter((entry): entry is ParsedFilter => entry !== null);
	} catch {
		return [];
	}
}

export function entryMatchesViewerFilters(
	frontMatter: Record<string, unknown>,
	filters: readonly ParsedFilter[] = getViewerFilters(),
): boolean {
	if (!filters.length) {
		return true;
	}

	return filters.every((filter) => matchesParsedFilter(frontMatter, filter));
}

function normalizeFilter(candidate: unknown): ParsedFilter | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const record = candidate as Record<string, unknown>;
	const pathValue = record.path;
	if (!Array.isArray(pathValue) || pathValue.length === 0) {
		return null;
	}

	const path = pathValue
		.map((segment) => (typeof segment === "string" ? segment.trim() : ""))
		.filter((segment) => segment.length > 0);

	if (!path.length) {
		return null;
	}

	const operatorValue = record.operator;
	const operator = normalizeOperator(operatorValue);
	if (!operator) {
		return null;
	}

	return {
		path,
		operator,
		value: record.value,
	};
}

function normalizeOperator(value: unknown): FilterOperator | null {
	if (typeof value !== "string") {
		return null;
	}

	switch (value) {
		case "exact":
		case "loose":
		case "prefix":
		case "suffix":
			return value;
		default:
			return null;
	}
}
