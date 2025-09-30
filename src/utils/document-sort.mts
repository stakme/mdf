import type { LoadedSchema } from "../types.mts";

export interface SchemaSortableItem {
	schema: Pick<LoadedSchema, "name" | "sort">;
	frontMatter: Record<string, unknown>;
}

export function compareBySchemaSort<T extends SchemaSortableItem>(
	a: T,
	b: T,
): number | null {
	if (a.schema.name !== b.schema.name) {
		return null;
	}

	const comparator = a.schema.sort;
	if (typeof comparator !== "function") {
		return null;
	}

	const result = comparator(a.frontMatter, b.frontMatter);
	if (
		typeof result !== "number" ||
		Number.isNaN(result) ||
		!Number.isFinite(result)
	) {
		return 0;
	}

	return result;
}

export function sortSchemaDocuments<T extends SchemaSortableItem>(
	items: readonly T[],
	fallback: (a: T, b: T) => number,
): T[] {
	const withIndex = items.map((item, index) => ({ item, index }));

	withIndex.sort((left, right) => {
		const schemaResult = compareBySchemaSort(left.item, right.item);
		if (schemaResult !== null && schemaResult !== 0) {
			return schemaResult;
		}

		const fallbackResult = fallback(left.item, right.item);
		if (fallbackResult !== 0) {
			return fallbackResult;
		}

		return left.index - right.index;
	});

	return withIndex.map((entry) => entry.item);
}
