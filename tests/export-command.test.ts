import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { runExportCommand } from "../src/commands/export.mts";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("mdf export", () => {
	it("builds a static viewer for filtered documents", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                status: z.enum(["draft", "published"]).default("draft"),
                                vpath: z.string(),
                        }),
                        vpath: (context) => context.fm.vpath,
                }),
        },
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const assetPath = path.join(notesDir, "shared.png");
		const assetContent = Buffer.from([0, 1, 2, 3, 4, 5]);
		await fs.writeFile(assetPath, assetContent);

		const firstSource = `---\ntitle: First\nstatus: draft\nvpath: backlog/first\n---\n# First\n\n![Cover](./shared.png)\n\nDraft content.`;
		await fs.writeFile(path.join(notesDir, "first.md"), firstSource, "utf8");

		const secondSource = `---\ntitle: Second\nstatus: published\nvpath: published/second\n---\n# Second\n\n![Cover](./shared.png)\n\nLive content.`;
		await fs.writeFile(path.join(notesDir, "second.md"), secondSource, "utf8");

		const outputDir = path.join(tempDir, "public");

		try {
			const result = await runExportCommand({
				cwd: tempDir,
				directory: "notes",
				outputDirectory: "public",
				filters: ["status=published"],
			});

			expect(result.outputDirectory).toBe(outputDir);
			expect(result.warnings).toHaveLength(0);
			expect(result.exported).toHaveLength(1);

			const exportedDocument = result.exported[0];
			const documentId = exportedDocument.id;

			const contextPath = path.join(outputDir, "api", "context", "index.json");
			const contextPayload = JSON.parse(
				await fs.readFile(contextPath, "utf8"),
			) as {
				headerOptions: Array<{ label: string; value: string }>;
				documents: Array<{
					id: string;
					meta: { title?: string; routePath?: string };
					workspaceRelativePath?: string | null;
				}>;
				defaultDocumentId: string | null;
			};
			expect(contextPayload.documents).toHaveLength(1);
			expect(contextPayload.documents[0]?.id).toBe(documentId);
			expect(contextPayload.documents[0]?.meta.title).toBe("Second");
			const routePath = contextPayload.documents[0]?.meta.routePath;
			expect(routePath).toBeDefined();
			if (!routePath) {
				throw new Error("Expected exported document to include a route path");
			}
			expect(contextPayload.headerOptions).toEqual([]);
			expect(contextPayload.defaultDocumentId).toBe(documentId);

			const documentPayload = JSON.parse(
				await fs.readFile(
					path.join(outputDir, "api", "documents", documentId, "index.json"),
					"utf8",
				),
			) as {
				frontMatter: Record<string, unknown>;
				html: string;
				workspaceRelativePath?: string | null;
			};
			expect(documentPayload.frontMatter.status).toBe("published");
			expect(documentPayload.html).toMatch(/Live content\./);
			expect(contextPayload.documents[0]?.workspaceRelativePath).toBe(
				"notes/second.md",
			);
			expect(documentPayload.workspaceRelativePath).toBe("notes/second.md");

			const frontMatterValues = JSON.parse(
				await fs.readFile(
					path.join(outputDir, "api", "front-matter", "status", "index.json"),
					"utf8",
				),
			) as { values: Array<{ value: string; documentCount: number }> };
			expect(
				frontMatterValues.values.some(
					(entry) => entry.value === "published" && entry.documentCount === 1,
				),
			).toBe(true);

			const expectedAssetPath = path.join(
				outputDir,
				"documents",
				documentId,
				"assets",
				"shared.png",
			);
			expect(exportedDocument.assetPaths).toEqual([expectedAssetPath]);
			const exportedAsset = await fs.readFile(expectedAssetPath);
			expect(exportedAsset.equals(assetContent)).toBe(true);
			const expectedRawIndexPath = path.join(
				outputDir,
				"documents",
				documentId,
				"index.md",
			);
			const expectedRawFilePath = path.join(
				outputDir,
				"documents",
				documentId,
				"raw.md",
			);
			const readableSegments = routePath.split("/");
			const expectedReadableIndexPath = path.join(
				outputDir,
				"documents",
				...readableSegments,
				"index.md",
			);
			const expectedReadableRawPath = path.join(
				outputDir,
				"documents",
				...readableSegments,
				"raw.md",
			);
			expect(exportedDocument.rawPaths).toEqual([
				expectedRawIndexPath,
				expectedRawFilePath,
				expectedReadableIndexPath,
				expectedReadableRawPath,
			]);
			await expect(fs.readFile(expectedRawIndexPath, "utf8")).resolves.toBe(
				secondSource,
			);
			await expect(fs.readFile(expectedRawFilePath, "utf8")).resolves.toBe(
				secondSource,
			);
			await expect(
				fs.readFile(expectedReadableIndexPath, "utf8"),
			).resolves.toBe(secondSource);
			await expect(fs.readFile(expectedReadableRawPath, "utf8")).resolves.toBe(
				secondSource,
			);
			await expect(
				fs.stat(path.join(outputDir, "index.html")),
			).resolves.toBeDefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("runs through the CLI and reports the viewer summary", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                status: z.enum(["draft", "published"]).default("draft"),
                                vpath: z.string(),
                        }),
                        vpath: (context) => context.fm.vpath,
                }),
        },
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "alpha.md"),
			`---\ntitle: Alpha\nstatus: published\nvpath: ready/alpha\n---\n# Alpha\n\nReady to share.`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "beta.md"),
			`---\ntitle: Beta\nstatus: draft\nvpath: draft/beta\n---\n# Beta\n\nStill in progress.`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[
					cliPath,
					"export",
					"notes",
					"--output",
					"public",
					"--filter",
					"status=published",
				],
				{
					cwd: tempDir,
				},
			);

			expect(stdout.trim()).toContain(
				"Exported viewer with 1 document to ./public",
			);

			const contextPayload = JSON.parse(
				await fs.readFile(
					path.join(tempDir, "public", "api", "context", "index.json"),
					"utf8",
				),
			) as { documents: Array<{ meta: { title?: string } }> };
			expect(contextPayload.documents).toHaveLength(1);
			expect(contextPayload.documents[0]?.meta.title).toBe("Alpha");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("includes repository metadata when repo options are passed", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                vpath: z.string(),
                        }),
                        vpath: (context) => context.fm.vpath,
                }),
        },
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const docsDir = path.join(tempDir, "docs");
		await fs.mkdir(docsDir, { recursive: true });
		await fs.writeFile(
			path.join(docsDir, "guide.md"),
			`---\ntitle: Guide\nvpath: docs/guide\n---\n# Guide`,
			"utf8",
		);

		const repoUrl = "https://github.com/acme/project/blob/main";

		try {
			await execa(
				nodeBinary,
				[
					cliPath,
					"export",
					"docs",
					"--output",
					"public",
					"--repo-url",
					repoUrl,
				],
				{ cwd: tempDir },
			);

			const contextPayload = JSON.parse(
				await fs.readFile(
					path.join(tempDir, "public", "api", "context", "index.json"),
					"utf8",
				),
			) as {
				repo?: { icon?: string; url?: string };
				documents: Array<{ workspaceRelativePath?: string | null }>;
			};
			expect(contextPayload.repo).toEqual({
				icon: "github",
				url: repoUrl,
			});
			expect(contextPayload.documents[0]?.workspaceRelativePath).toBe(
				"docs/guide.md",
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("uses configured virtual slugs for document routes", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                vpath: z.string(),
                                slug: z.string(),
                        }),
                        vpath: (context) => context.fm.vpath,
                        vslug: (context) => context.fm.slug,
                }),
        },
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "first.md"),
			`---\ntitle: First\nvpath: backlog/first\nslug: evergreen/reference\n---\n# First`,
			"utf8",
		);

		const outputDir = path.join(tempDir, "public");

		try {
			const result = await runExportCommand({
				cwd: tempDir,
				directory: "notes",
				outputDirectory: "public",
			});

			expect(result.warnings).toEqual([]);
			expect(result.exported).toHaveLength(1);

			const contextPayload = JSON.parse(
				await fs.readFile(
					path.join(outputDir, "api", "context", "index.json"),
					"utf8",
				),
			) as {
				documents: Array<{
					id: string;
					slug: string;
					meta: { routePath: string };
				}>;
			};

			const [documentSummary] = contextPayload.documents;
			expect(documentSummary).toBeDefined();
			if (!documentSummary) {
				return;
			}

			expect(documentSummary.slug).toBe("evergreen/reference");
			expect(documentSummary.meta.routePath).toBe("evergreen/reference");

			const documentData = JSON.parse(
				await fs.readFile(
					path.join(
						outputDir,
						"api",
						"documents",
						documentSummary.id,
						"index.json",
					),
					"utf8",
				),
			) as { frontMatter: Record<string, unknown> };
			expect(documentData.frontMatter.slug).toBeUndefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
