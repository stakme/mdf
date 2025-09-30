import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	createViewerApp,
	prepareViewerContext,
	renderViewerHtml,
} from "../src/commands/viewer.mts";
import { setupWorkspace } from "./helpers";

describe("viewer command", () => {
	it("prepares viewer context with filters and renders html", async () => {
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

		await fs.writeFile(
			path.join(notesDir, "alpha.md"),
			`---\ntitle: Alpha\nstatus: todo\nvpath: docs/alpha\n---\n# Alpha\n\nContent`,
			"utf8",
		);

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
			expect(doc.meta.routePath).toBe("docs/alpha");
			expect(doc.html).not.toContain("<h1>Alpha</h1>");
			expect(doc.html).toMatch(/<p>Content<\/p>/);

			expect(context.navigation.children).toHaveLength(1);
			const firstNode = context.navigation.children[0];
			expect(firstNode.type).toBe("dir");
			if (firstNode.type === "dir") {
				expect(firstNode.name).toBe("docs");
				expect(firstNode.children).toHaveLength(1);
				const child = firstNode.children[0];
				expect(child.type).toBe("file");
				if (child.type === "file") {
					expect(child.documentId).toBe(doc.id);
				}
			}

			const html = renderViewerHtml(context, doc);
			expect(html).toContain('<html lang="en" class="dark" data-theme="dark">');
			expect(html).toContain('<meta name="color-scheme" content="dark" />');
			expect(html).toContain("cdn.tailwindcss.com");
			expect(html).toContain("Alpha");
			expect(html).toContain("Front matter");
			expect(html).toMatch(/status[\s\S]*todo/);
			expect(html).toMatch(/vpath[\s\S]*docs\/alpha/);
			expect(html).toMatch(
				/Filter<\/span><span class="font-mono leading-none normal-case">status=todo<\/span>/,
			);
			expect(html).toMatch(
				/Virtual Path<\/span><span class="font-mono leading-none normal-case">docs<\/span>/,
			);
			expect(html).toContain('EventSource("/events")');
			expect(html).not.toContain("Beta");
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
			expect(imageMatch?.[1]).toBeDefined();
			const assetPath = imageMatch?.[1];
			expect(assetPath).toBe(
				`/documents/${encodeURIComponent(doc.id)}/assets/diagram.png`,
			);

			const { app } = createViewerApp(() => context);
			const response = await app.request(`http://localhost${assetPath ?? ""}`);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("image/png");
			const responseBuffer = Buffer.from(await response.arrayBuffer());
			expect(responseBuffer.equals(imageBuffer)).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("renders collapsible navigation and enforces depth limit", async () => {
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
			path.join(notesDir, "deep.md"),
			`---\ntitle: Deep Doc\nvpath: root/one/two/three/four/five/six/seven\n---\n# Deep Doc`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "shallow.md"),
			`---\ntitle: Shallow Doc\nvpath: root/shallow\n---\n# Shallow Doc`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "other.md"),
			`---\ntitle: Other Doc\nvpath: other/doc\n---\n# Other Doc`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "notes",
			});

			const deepDoc = context.documents.find(
				(doc) => doc.meta.title === "Deep Doc",
			);
			expect(deepDoc).toBeDefined();
			if (!deepDoc) {
				return;
			}

			const html = renderViewerHtml(context, deepDoc);
			expect(html).toContain('data-viewer-nav="tree"');
			expect(html).toContain("bg-muted/30");
			expect(html).toContain('<details class="group" open>');
			expect(html).toContain('<details class="group">');
			expect(html).toContain("Nested levels deeper than 6 are hidden.");
			expect(html).toContain('data-viewer-nav-node="file"');
			expect(html).toContain(
				'data-viewer-nav-path="root/one/two/three/four/five/six"',
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("ignores invalid documents and records warnings by default", async () => {
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

			expect(context.documents).toHaveLength(1);
			expect(context.documents[0]?.meta.title).toBe("Valid");
			expect(context.warnings).toHaveLength(1);
			const warning = context.warnings[0];
			expect(warning?.filePath.endsWith("broken.md")).toBe(true);
			expect(warning?.messages[0]).toContain("Front matter not found");
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

			expect(context.documents.map((doc) => doc.meta.title)).toEqual([
				"Second",
				"First",
				"Third",
			]);
			expect(context.defaultDocument.meta.title).toBe("Second");
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

			expect(context.documents.map((doc) => doc.meta.title)).toEqual([
				"Alpha",
				"Mu",
				"Zeta",
			]);
			expect(context.defaultDocument.meta.title).toBe("Alpha");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
