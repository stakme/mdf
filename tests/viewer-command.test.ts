import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildViewerContextPayload,
	buildViewerDocumentPayload,
	createViewerApp,
	prepareViewerContext,
} from "../src/commands/viewer.mts";
import { setupWorkspace } from "./helpers";

const BASE_CONFIG = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                section: z.string().optional(),
                                status: z.enum(["todo", "done"]).default("todo"),
                                vpath: z.string().optional(),
                                slug: z.string().optional(),
                        }),
                        vpath: (context) => {
                                const raw = typeof context.fm.vpath === "string" ? context.fm.vpath.trim() : "";
                                if (raw.length > 0) {
                                        return raw;
                                }
                                const section = typeof context.fm.section === "string" ? context.fm.section.trim() : "";
                                return section.length > 0 ? "/" + section : "/";
                        },
                        vslug: (context) => {
                                const relative = typeof context.relativePath === "string"
                                        ? context.relativePath.replace(/^\\.\\/+/, "")
                                        : context.relativePath;
                                const base = context.fm.slug ?? relative;
                                return String(base).replace(/\\.md$/u, "").replace(/\\\\/g, "/");
                        },
                }),
        },
        defaultSchema: "default",
});`;

describe("viewer command", () => {
	it("prepares viewer context with filters and virtual path resolver", async () => {
		const tempDir = await setupWorkspace({ config: BASE_CONFIG });
		const notesDir = path.join(tempDir, "docs");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "alpha.md"),
			`---\ntitle: Alpha\nsection: guides\nstatus: todo\n---\n# Alpha`,
			"utf8",
		);
		await fs.writeFile(
			path.join(notesDir, "beta.md"),
			`---\ntitle: Beta\nsection: guides\nstatus: done\n---\n# Beta`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
				filters: ["status=todo"],
				virtualPathPrefix: "guides",
			});
			expect(context.warnings).toEqual([]);

			expect(context.documents).toHaveLength(1);
			const document = context.documents[0];
			expect(document.meta.title).toBe("Alpha");
			expect(document.meta.virtualPath).toBe("/guides");
			expect(document.meta.routePath).toBe("alpha");

			const payload = buildViewerContextPayload(context);
			expect(payload.headerOptions).toEqual([
				{ label: "Filter", value: "status=todo" },
				{ label: "Virtual Path", value: "guides" },
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("sanitizes virtual metadata from document front matter payload", async () => {
		const tempDir = await setupWorkspace({ config: BASE_CONFIG });
		const notesDir = path.join(tempDir, "docs");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "article.md"),
			`---\ntitle: Article\nsection: knowledge\nvpath: knowledge/library\nslug: knowledge/library\nextra: keep me\n---\n# Article`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			expect(context.documents).toHaveLength(1);
			const document = context.documents[0];
			expect(document.frontMatter).toEqual({
				title: "Article",
				extra: "keep me",
				section: "knowledge",
			});

			const payload = buildViewerDocumentPayload(document);
			expect(payload.frontMatter).toEqual({
				title: "Article",
				extra: "keep me",
				section: "knowledge",
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("includes repository metadata in prepared context", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                        }),
                        vpath: () => "/",
                }),
        },
        defaultSchema: "default",
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
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("serves viewer JSON APIs using computed virtual paths", async () => {
		const tempDir = await setupWorkspace({ config: BASE_CONFIG });
		const docsDir = path.join(tempDir, "docs");
		await fs.mkdir(docsDir, { recursive: true });

		await fs.writeFile(
			path.join(docsDir, "intro.md"),
			`---\ntitle: Intro\nsection: getting-started\n---\n# Intro`,
			"utf8",
		);

		try {
			const context = await prepareViewerContext({
				cwd: tempDir,
				directory: "docs",
			});

			const { app } = await createViewerApp(() => context);
			const response = await app.request("http://localhost/api/context");
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(Array.isArray(body.documents)).toBe(true);
			expect(body.documents[0]?.meta.virtualPath).toBe("/getting-started");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
