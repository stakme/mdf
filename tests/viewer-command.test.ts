import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildViewerContextPayload,
	buildViewerDocumentPayload,
	createViewerApp,
	prepareViewerContext,
	type ViewerContext,
	type ViewerNavigationDirectory,
	type ViewerNavigationFile,
} from "../src/commands/viewer.mts";
import { setupWorkspace } from "./helpers";

describe("viewer command", () => {
	it("prepares viewer context with filters and exposes JSON APIs", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                status: z.enum(["todo", "done"]).default("todo"),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const alphaSource = `---\ntitle: Alpha\nstatus: todo\nvpath: docs/alpha\n---\n# Alpha\n\nContent`;
		await fs.writeFile(path.join(notesDir, "alpha.md"), alphaSource, "utf8");

		await fs.writeFile(
			path.join(notesDir, "beta.md"),
			`---\ntitle: Beta\nstatus: done\nvpath: docs/beta\n---\n# Beta`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
				filters: ["status=todo"],
				virtualPathPrefix: "docs",
			});

			expect(context.documents).toHaveLength(1);
			const doc = context.documents[0];
			expect(doc.meta.title).toBe("Alpha");
			expect(doc.meta.routePath).toBe("alpha");
			expect(doc.html).toMatch(/<p>Content<\/p>/);
			expect(doc.workspaceRelativePath).toBe("notes/alpha.md");

			const payload = buildViewerContextPayload(context);
			expect(payload.headerOptions).toEqual([
				{ label: "Filter", value: "status=todo" },
				{ label: "Virtual Path", value: "docs" },
			]);
			expect(payload.defaultDocumentId).toBe(doc.id);
			expect(payload.documents[0]?.meta.routePath).toBe("alpha");
			expect(payload.documents[0]?.workspaceRelativePath).toBe(
				"notes/alpha.md",
			);
			expect(payload.repo).toBeNull();

			const { app } = await createViewerApp(() => context);

			const contextResponse = await app.request("http://localhost/api/context");
			expect(contextResponse.status).toBe(200);
			const contextJson = await contextResponse.json();
			expect(contextJson.documents).toHaveLength(1);
			expect(contextJson.documents[0]?.meta.title).toBe("Alpha");
			expect(contextJson.documents[0]?.workspaceRelativePath).toBe(
				"notes/alpha.md",
			);
			expect(
				contextJson.frontMatter.map((field: { name: string }) => field.name),
			).toEqual(["status", "title", "vpath"]);
			expect(contextJson.repo).toBeNull();

			const contextIndexResponse = await app.request(
				"http://localhost/api/context/index.json",
			);
			expect(contextIndexResponse.status).toBe(200);
			const contextIndexJson = await contextIndexResponse.json();
			expect(contextIndexJson.documents[0]?.id).toBe(
				contextJson.documents[0]?.id,
			);
			expect(contextIndexJson.documents[0]?.workspaceRelativePath).toBe(
				"notes/alpha.md",
			);
			expect(contextIndexJson.repo).toBeNull();

			const docResponse = await app.request(
				`http://localhost/api/documents/${encodeURIComponent(doc.id)}`,
			);
			expect(docResponse.status).toBe(200);
			const docJson = await docResponse.json();
			expect(docJson.html).toContain("Content");
			expect(docJson.frontMatter.status).toBe("todo");
			expect(docJson.raw).toBe(alphaSource);
			expect(docJson.workspaceRelativePath).toBe("notes/alpha.md");

			const docIndexResponse = await app.request(
				`http://localhost/api/documents/${encodeURIComponent(doc.id)}/index.json`,
			);
			expect(docIndexResponse.status).toBe(200);
			const docIndexJson = await docIndexResponse.json();
			expect(docIndexJson.frontMatter.status).toBe("todo");
			expect(docIndexJson.raw).toBe(alphaSource);
			expect(docIndexJson.workspaceRelativePath).toBe("notes/alpha.md");

			const frontMatterIndexResponse = await app.request(
				"http://localhost/api/front-matter/index.json",
			);
			expect(frontMatterIndexResponse.status).toBe(200);
			const frontMatterIndexJson = await frontMatterIndexResponse.json();
			expect(
				frontMatterIndexJson.fields.map(
					(field: { name: string }) => field.name,
				),
			).toEqual(["status", "title", "vpath"]);

			const statusFieldResponse = await app.request(
				"http://localhost/api/front-matter/status/index.json",
			);
			expect(statusFieldResponse.status).toBe(200);
			const statusFieldJson = await statusFieldResponse.json();
			expect(statusFieldJson.name).toBe("status");

			const statusValueResponse = await app.request(
				"http://localhost/api/front-matter/status/todo/index.json",
			);
			expect(statusValueResponse.status).toBe(200);
			const statusValueJson = await statusValueResponse.json();
			expect(statusValueJson.value).toBe("todo");

			const rootResponse = await app.request("http://localhost/");
			expect(rootResponse.status).toBe(200);
			const rootHtml = await rootResponse.text();
			expect(rootHtml).toContain('<div id="root"></div>');
			expect(rootHtml).not.toContain("cdn.tailwindcss.com");

			const readableRoute = doc.meta.routePath
				.split("/")
				.map((segment) => encodeURIComponent(segment))
				.join("/");
			const readableResponse = await app.request(
				`http://localhost/documents/${readableRoute}/index.md`,
			);
			expect(readableResponse.status).toBe(200);
			expect(readableResponse.headers.get("content-type")).toContain(
				"text/markdown",
			);
			const readableMarkdown = await readableResponse.text();
			expect(readableMarkdown).toBe(alphaSource);

			const legacyResponse = await app.request(
				`http://localhost/documents/${encodeURIComponent(doc.id)}/index.md`,
			);
			expect(legacyResponse.status).toBe(200);
			expect(legacyResponse.headers.get("content-type")).toContain(
				"text/markdown",
			);
			const legacyMarkdown = await legacyResponse.text();
			expect(legacyMarkdown).toBe(alphaSource);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("omits header options when includeHeaderOptions is false", () => {
		const context: ViewerContext = {
			cwd: "/tmp",
			directory: "/tmp/docs",
			directoryLabel: "docs",
			headerOptions: [{ label: "Filter", value: "status=todo" }],
			documents: [],
			documentMap: new Map<string, never>(),
			routePathMap: new Map<string, never>(),
			navigation: { type: "dir", name: "", children: [] },
			defaultDocument: null,
			frontMatterIndex: {
				fields: [],
				fieldMap: new Map<string, never>(),
			},
			virtualPathParam: "vpath",
			virtualPathSeparator: "/",
			warnings: [],
			repo: null,
		};

		const payload = buildViewerContextPayload(context, {
			includeHeaderOptions: false,
		});

		expect(payload.headerOptions).toEqual([]);
	});

	it("includes repository metadata when configured", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
        }),
        virtualPath: {
                param: "vpath",
        },
        repo: {
                icon: "gitlab",
                url: "https://gitlab.com/acme/wiki/-/tree/main/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const docsDir = path.join(tempDir, "docs");
		await fs.mkdir(docsDir, { recursive: true });
		await fs.writeFile(
			path.join(docsDir, "guide.md"),
			`---\ntitle: Guide\n---\n# Guide`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			expect(context.repo).toEqual({
				icon: "gitlab",
				url: "https://gitlab.com/acme/wiki/-/tree/main/",
			});

			const payload = buildViewerContextPayload(context);
			expect(payload.repo).toEqual({
				icon: "gitlab",
				url: "https://gitlab.com/acme/wiki/-/tree/main/",
			});

			const { app } = await createViewerApp(() => context);
			const response = await app.request(
				"http://localhost/api/context/index.json",
			);
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json.repo).toEqual({
				icon: "gitlab",
				url: "https://gitlab.com/acme/wiki/-/tree/main/",
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("uses configured virtual slugs for routes and sanitizes front matter", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
                slug: z.string(),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
        virtualSlug: {
                param: "slug",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const docsDir = path.join(tempDir, "docs");
		await fs.mkdir(docsDir, { recursive: true });

		await fs.writeFile(
			path.join(docsDir, "guide.md"),
			`---\ntitle: Guide\nslug: evergreen/guide\n---\n# Guide`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			expect(context.documents).toHaveLength(1);
			const [document] = context.documents;
			expect(document.slug).toBe("evergreen/guide");
			expect(document.meta.routePath).toBe("evergreen/guide");
			expect(document.frontMatter.slug).toBeUndefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("falls back to directory-relative slugs when virtual slug field is absent", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
                slug: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
        virtualSlug: {
                param: "slug",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const docsDir = path.join(tempDir, "docs");
		await fs.mkdir(path.join(docsDir, "manual"), { recursive: true });

		await fs.writeFile(
			path.join(docsDir, "manual", "intro.md"),
			`---\ntitle: Intro\n---\n# Intro`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			expect(context.documents).toHaveLength(1);
			const [document] = context.documents;
			expect(document.slug).toBe("manual/intro");
			expect(document.meta.routePath).toBe("manual/intro");
			expect(document.relativePath).toBe("manual/intro.md");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("places documents without virtual path in viewer root", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(path.join(notesDir, "cli"), { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "overview.md"),
			`---\ntitle: Overview\n---\n# Overview`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "cli", "reference.md"),
			`---\ntitle: CLI Reference\nvpath: cli/reference\n---\n# Reference`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const overviewDoc = context.documents.find(
				(doc) => doc.meta.title === "Overview",
			);
			expect(overviewDoc).toBeDefined();

			const overviewEntry = context.navigation.children.find(
				(child) =>
					child.type === "file" && child.documentId === overviewDoc?.id,
			);
			expect(overviewEntry).toBeDefined();

			const extraneousDir = context.navigation.children.find(
				(child) => child.type === "dir" && child.name === "notes",
			);
			expect(extraneousDir).toBeUndefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("filters document front matter using visibleFields", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                docs: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                draft: z.boolean().default(false),
                                extra: z.string().optional(),
                                vpath: z.string().optional(),
                        }),
                        visibleFields: ["title", "draft"],
                }),
        },
        defaultSchema: "docs",
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "doc.md"),
			`---\ntitle: Visible\ndraft: false\nextra: keep me out\n---\n# Visible`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			expect(context.documents).toHaveLength(1);
			const doc = context.documents[0];
			expect(doc.visibleFields).toEqual(["title", "draft"]);
			expect(doc.frontMatter).toEqual({ title: "Visible" });

			const payload = buildViewerDocumentPayload(doc);
			expect(payload.visibleFields).toEqual(["title", "draft"]);
			expect(payload.frontMatter).toEqual({ title: "Visible" });
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("respects explicit root virtual path when building navigation", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
        sort: (a, b) => a.chapter - b.chapter,
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "docs");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "overview.md"),
			`---\ntitle: Docs Overview\nchapter: 1\nvpath: /\n---\n# Docs Overview`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "reference.md"),
			`---\ntitle: CLI Reference\nchapter: 2\nvpath: cli/reference\n---\n# CLI Reference`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			const overviewDoc = context.documents.find(
				(doc) => doc.meta.title === "Docs Overview",
			);
			expect(overviewDoc?.meta.virtualPath).toBe("/");
			expect(overviewDoc?.meta.routePath).toBe("overview");

			const referenceDoc = context.documents.find(
				(doc) => doc.meta.title === "CLI Reference",
			);

			const rootEntries = context.navigation.children.filter(
				(child): child is ViewerNavigationFile => child.type === "file",
			);
			expect(rootEntries.map((entry) => entry.documentId)).toContain(
				overviewDoc?.id,
			);

			const cliDirectory = context.navigation.children.find(
				(child): child is ViewerNavigationDirectory =>
					child.type === "dir" && child.name === "cli",
			);
			expect(cliDirectory).toBeDefined();
			expect(
				cliDirectory?.children.map((child) =>
					child.type === "file" ? child.documentId : child.name,
				),
			).toContain(referenceDoc?.id);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("nests documents sharing virtual path segments", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                chapter: z.number(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
        sort: (a, b) => a.chapter - b.chapter,
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const docsDir = path.join(tempDir, "docs");
		await fs.mkdir(docsDir, { recursive: true });

		await fs.writeFile(
			path.join(docsDir, "overview.md"),
			`---\ntitle: Docs Overview\nchapter: 1\nvpath: /\n---\n# Docs Overview`,
			"utf8",
		);

		await fs.writeFile(
			path.join(docsDir, "cli-reference.md"),
			`---\ntitle: CLI Reference\nchapter: 2\nvpath: cli\n---\n# CLI Reference`,
			"utf8",
		);

		await fs.writeFile(
			path.join(docsDir, "cli-filters.md"),
			`---\ntitle: Filters and Virtual Paths\nchapter: 3\nvpath: cli\n---\n# Filters`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			const cliDirectory = context.navigation.children.find(
				(child): child is ViewerNavigationDirectory =>
					child.type === "dir" && child.name === "cli",
			);
			expect(cliDirectory).toBeDefined();
			expect(cliDirectory?.children).toHaveLength(2);
			expect(
				cliDirectory?.children.map((child) =>
					child.type === "file" ? child.name : child.name,
				),
			).toEqual(["CLI Reference", "Filters and Virtual Paths"]);

			const rootFiles = context.navigation.children.filter(
				(child): child is ViewerNavigationFile => child.type === "file",
			);
			expect(rootFiles.map((entry) => entry.name)).toContain("Docs Overview");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("keeps leading heading when it does not match the front matter title", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "delta.md"),
			`---\ntitle: Alpha\nvpath: docs/delta\n---\n# Different heading\n\nBody`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			expect(context.documents).toHaveLength(1);
			const doc = context.documents[0];
			expect(doc.meta.title).toBe("Alpha");
			expect(doc.html).toMatch(/<h1[^>]*>Different heading<\/h1>/);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("serves relative images referenced in markdown", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const imagePath = path.join(notesDir, "diagram.png");
		const imageBuffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
		await fs.writeFile(
			path.join(notesDir, "gamma.md"),
			`---\ntitle: Gamma\nvpath: docs/gamma\n---\n![Diagram](./diagram.png)`,
			"utf8",
		);
		await fs.writeFile(imagePath, imageBuffer);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const doc = context.documents[0];
			const imageMatch = doc.html.match(/<img[^>]+src="([^"]+)"/u);
			expect(imageMatch?.[1]).toBe(
				`/documents/${encodeURIComponent(doc.id)}/assets/diagram.png`,
			);

			const { app } = await createViewerApp(() => context);
			const response = await app.request(
				`http://localhost${imageMatch?.[1] ?? ""}`,
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("image/png");
			const responseBuffer = Buffer.from(await response.arrayBuffer());
			expect(responseBuffer.equals(imageBuffer)).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("returns empty context when no documents are present", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string().optional(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const payload = buildViewerContextPayload(context);
			expect(payload.documents).toHaveLength(0);
			expect(payload.defaultDocumentId).toBeNull();

			const { app } = await createViewerApp(() => context);
			const contextResponse = await app.request("http://localhost/api/context");
			expect(contextResponse.status).toBe(200);
			const json = await contextResponse.json();
			expect(json.documents).toHaveLength(0);
			expect(json.defaultDocumentId).toBeNull();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("exposes front matter relationships via API", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                tags: z.array(z.string()).optional(),
                status: z.string().optional(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "design.md"),
			`---\ntitle: Design\ntags:\n  - design\n  - ux\nstatus: draft\nvpath: docs/design\n---\n# Design`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "research.md"),
			`---\ntitle: Research\ntags:\n  - research\n  - design\nstatus: done\nvpath: docs/research\n---\n# Research`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const payload = buildViewerContextPayload(context);
			const tagsField = payload.frontMatter.find(
				(field) => field.name === "tags",
			);
			expect(tagsField?.values).toHaveLength(3);

			const { app } = await createViewerApp(() => context);

			const fieldResponse = await app.request(
				"http://localhost/api/front-matter",
			);
			expect(fieldResponse.status).toBe(200);
			const fieldJson = await fieldResponse.json();
			expect(
				fieldJson.fields.some(
					(field: { name: string }) => field.name === "tags",
				),
			).toBe(true);

			const tagsResponse = await app.request(
				"http://localhost/api/front-matter/tags",
			);
			expect(tagsResponse.status).toBe(200);
			const tagsJson = await tagsResponse.json();
			expect(
				tagsJson.values.some(
					(value: { value: string }) => value.value === "design",
				),
			).toBe(true);

			const valueResponse = await app.request(
				"http://localhost/api/front-matter/tags/design",
			);
			expect(valueResponse.status).toBe(200);
			const valueJson = await valueResponse.json();
			expect(
				valueJson.documents.map(
					(doc: { meta: { title: string } }) => doc.meta.title,
				),
			).toEqual(["Design", "Research"]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("includes invalid documents and records warnings by default", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "valid.md"),
			`---\ntitle: Valid\nvpath: docs/valid\n---\n# Body`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "broken.md"),
			"# Missing front matter\n",
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			expect(context.documents).toHaveLength(2);
			expect(context.warnings).toHaveLength(1);
			const warning = context.warnings[0];
			expect(warning?.filePath.endsWith("broken.md")).toBe(true);

			const payload = buildViewerContextPayload(context);
			expect(payload.warnings).toHaveLength(1);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("skips invalid documents when ignoreInvalid is enabled", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "valid.md"),
			`---\ntitle: Valid\nvpath: docs/valid\n---\n# Body`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "broken.md"),
			"# Missing front matter\n",
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
				ignoreInvalid: true,
			});

			expect(context.documents).toHaveLength(1);
			expect(context.documents[0]?.meta.title).toBe("Valid");
			expect(context.warnings).toHaveLength(1);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("throws in strict mode when encountering invalid documents", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });

		try {
			const notesDir = path.join(tempDir, "notes");
			await fs.mkdir(notesDir, { recursive: true });
			await fs.writeFile(
				path.join(notesDir, "broken.md"),
				"# Missing front matter\n",
				"utf8",
			);

			await expect(async () => {
				await prepareViewerContext({
					cwd: tempDir,
					directory: "notes",
					strict: true,
				});
			}).rejects.toThrow(/Front matter not found/);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("orders viewer documents using schema-defined sort comparator", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                posts: {
                        glob: "notes/**",
                        schema: z.object({
                                title: z.string(),
                                vpath: z.string(),
                                created_at: z.string(),
                        }),
                        sort: (a, b) => b.created_at.localeCompare(a.created_at),
                },
        },
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "first.md"),
			`---\ntitle: First\nvpath: posts/first\ncreated_at: 2024-02-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "second.md"),
			`---\ntitle: Second\nvpath: posts/second\ncreated_at: 2025-01-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "third.md"),
			`---\ntitle: Third\nvpath: posts/third\ncreated_at: 2023-12-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			expect(context.documents.map((entry) => entry.meta.title)).toEqual([
				"Second",
				"First",
				"Third",
			]);
			expect(context.defaultDocument?.meta.title).toBe("Second");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("respects schema-defined sort order in navigation entries", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                posts: {
                        glob: "notes/**",
                        schema: z.object({
                                title: z.string(),
                                vpath: z.string(),
                                created_at: z.string(),
                        }),
                        sort: (a, b) => b.created_at.localeCompare(a.created_at),
                },
        },
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "first.md"),
			`---\ntitle: First\nvpath: posts/first\ncreated_at: 2024-02-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "second.md"),
			`---\ntitle: Second\nvpath: posts/second\ncreated_at: 2025-01-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "third.md"),
			`---\ntitle: Third\nvpath: posts/third\ncreated_at: 2023-12-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const postsDirectory = context.navigation.children.find(
				(child): child is ViewerNavigationDirectory =>
					child.type === "dir" && child.name === "posts",
			);

			expect(postsDirectory).toBeDefined();
			if (!postsDirectory) {
				return;
			}

			const fileNames = postsDirectory.children
				.filter((child): child is ViewerNavigationFile => child.type === "file")
				.map((child) => child.name);

			expect(fileNames).toEqual(["Second", "First", "Third"]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("falls back to sorting viewer documents by title when no comparator is provided", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "zeta.md"),
			`---\ntitle: Zeta\nvpath: posts/zeta\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "alpha.md"),
			`---\ntitle: Alpha\nvpath: posts/alpha\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "mu.md"),
			`---\ntitle: Mu\nvpath: posts/mu\n---\n`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			expect(context.documents.map((entry) => entry.meta.title)).toEqual([
				"Alpha",
				"Mu",
				"Zeta",
			]);
			expect(context.defaultDocument?.meta.title).toBe("Alpha");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
