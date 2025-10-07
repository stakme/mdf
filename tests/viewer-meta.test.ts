import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
	return import("../src/viewer/meta.mts");
}

beforeEach(() => {
	delete process.env.MDF_VIRTUAL_PATH_PARAM;
	delete process.env.MDF_VIRTUAL_PATH_SEPARATOR;
	delete process.env.MDF_VIEWER_FIELD_TITLE;
	delete process.env.MDF_VIEWER_FIELD_DESCRIPTION;
	delete process.env.MDF_VIEWER_FIELD_TAGS;
	delete process.env.MDF_VIEWER_FIELD_AUTHOR;
	delete process.env.MDF_VIEWER_FIELD_CREATEDAT;
	delete process.env.MDF_VIEWER_FIELD_UPDATEDAT;
	vi.resetModules();
});

afterEach(() => {
	delete process.env.MDF_VIRTUAL_PATH_PARAM;
	delete process.env.MDF_VIRTUAL_PATH_SEPARATOR;
	delete process.env.MDF_VIEWER_FIELD_TITLE;
	delete process.env.MDF_VIEWER_FIELD_DESCRIPTION;
	delete process.env.MDF_VIEWER_FIELD_TAGS;
	delete process.env.MDF_VIEWER_FIELD_AUTHOR;
	delete process.env.MDF_VIEWER_FIELD_CREATEDAT;
	delete process.env.MDF_VIEWER_FIELD_UPDATEDAT;
});

describe("buildViewerEntry", () => {
	it("derives metadata with sensible fallbacks", async () => {
		const { buildViewerEntry } = await loadModule();
		const entry = {
			slug: "docs/example-note",
			data: {
				title: "Example",
				description: "Sample description",
				tags: ["alpha", 2],
				author: "Ada",
				created_at: "2024-01-01T00:00:00.000Z",
				updated_at: "2024-02-01T00:00:00.000Z",
				vpath: "notes/planning",
				draft: false,
			},
		} as unknown as import("astro:content").CollectionEntry<"pages">;

		const meta = buildViewerEntry(entry);
		expect(meta.title).toBe("Example");
		expect(meta.description).toBe("Sample description");
		expect(meta.tags).toEqual(["alpha", "2"]);
		expect(meta.author).toBe("Ada");
		expect(meta.createdAt).toBe("2024-01-01T00:00:00.000Z");
		expect(meta.updatedAt).toBe("2024-02-01T00:00:00.000Z");
		expect(meta.virtualPath).toBe("notes/planning");
		expect(meta.routePath).toBe("docs/example-note");
		expect(meta.draft).toBe(false);
	});

	it("falls back to slug and obeys virtual path overrides", async () => {
		process.env.MDF_VIRTUAL_PATH_PARAM = "path";
		process.env.MDF_VIRTUAL_PATH_SEPARATOR = "::";
		const { buildViewerEntry } = await loadModule();
		const entry = {
			slug: "folder/task",
			data: {
				name: "No Title",
				path: "alpha::beta",
				draft: "true",
			},
		} as unknown as import("astro:content").CollectionEntry<"pages">;

		const meta = buildViewerEntry(entry);
		expect(meta.title).toBe("No Title");
		expect(meta.virtualPath).toBe("alpha::beta");
		expect(meta.routePath).toBe("folder/task");
		expect(meta.draft).toBe(true);
	});

	it("appends the file slug to ensure unique route paths", async () => {
		const { buildViewerEntry } = await loadModule();
		const entry = {
			slug: "docs/commands-validate",
			data: {
				title: "validate",
				vpath: "commands",
			},
		} as unknown as import("astro:content").CollectionEntry<"pages">;

		const meta = buildViewerEntry(entry);
		expect(meta.routePath).toBe("docs/commands-validate");
	});

	it("preserves explicit root virtual paths", async () => {
		const { buildViewerEntry } = await loadModule();
		const entry = {
			slug: "docs/overview",
			data: {
				title: "Docs Overview",
				vpath: "/",
			},
		} as unknown as import("astro:content").CollectionEntry<"pages">;

		const meta = buildViewerEntry(entry);
		expect(meta.virtualPath).toBe("/");
		expect(meta.routePath).toBe("docs/overview");
	});

	it("derives nested root routes from slug", async () => {
		const { buildViewerEntry } = await loadModule();
		const entry = {
			slug: "guides/install",
			data: {
				title: "Install",
				vpath: "/",
			},
		} as unknown as import("astro:content").CollectionEntry<"pages">;

		const meta = buildViewerEntry(entry);
		expect(meta.routePath).toBe("guides/install");
	});

	it("respects environment overrides for field candidates", async () => {
		process.env.MDF_VIEWER_FIELD_TITLE = "heading";
		process.env.MDF_VIEWER_FIELD_TAGS = "labels topics";
		const { buildViewerEntry } = await loadModule();
		const entry = {
			slug: "note",
			data: {
				heading: "Custom",
				labels: "release",
			},
		} as unknown as import("astro:content").CollectionEntry<"pages">;

		const meta = buildViewerEntry(entry);
		expect(meta.title).toBe("Custom");
		expect(meta.tags).toEqual(["release"]);
		expect(meta.virtualPath).toBe("note");
		expect(meta.routePath).toBe("note");
	});
});
