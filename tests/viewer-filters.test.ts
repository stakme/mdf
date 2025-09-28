import { afterEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
	return import("../src/viewer/filters.mts");
}

afterEach(() => {
	delete process.env.MDF_FILTERS;
	vi.resetModules();
});

describe("viewerFilters", () => {
	it("matches all entries when no filters are set", async () => {
		const { entryMatchesViewerFilters, getViewerFilters } = await loadModule();
		expect(getViewerFilters()).toHaveLength(0);
		expect(entryMatchesViewerFilters({ status: "todo" })).toBe(true);
	});

	it("filters entries using exact matching", async () => {
		process.env.MDF_FILTERS = JSON.stringify([
			{ path: ["status"], operator: "exact", value: "todo" },
		]);

		const { entryMatchesViewerFilters, getViewerFilters } = await loadModule();
		expect(getViewerFilters()).toHaveLength(1);
		expect(entryMatchesViewerFilters({ status: "todo" })).toBe(true);
		expect(entryMatchesViewerFilters({ status: "done" })).toBe(false);
	});

	it("supports loose matching on array values", async () => {
		process.env.MDF_FILTERS = JSON.stringify([
			{ path: ["tags"], operator: "loose", value: "feature" },
		]);

		const { entryMatchesViewerFilters } = await loadModule();
		expect(
			entryMatchesViewerFilters({
				tags: ["release", "Feature"],
				status: "todo",
			}),
		).toBe(true);
		expect(
			entryMatchesViewerFilters({ tags: ["release"], status: "todo" }),
		).toBe(false);
	});
});
