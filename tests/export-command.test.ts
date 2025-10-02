import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { runExportCommand } from "../src/commands/export.mts";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("mdf export", () => {
	it("builds a static viewer for filtered documents", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                status: z.enum(["draft", "published"]).default("draft"),
                vpath: z.string(),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const assetPath = path.join(notesDir, "shared.png");
		const assetContent = Buffer.from([0, 1, 2, 3, 4, 5]);
		await fs.writeFile(assetPath, assetContent);

		await fs.writeFile(
			path.join(notesDir, "first.md"),
			`---\ntitle: First\nstatus: draft\nvpath: backlog/first\n---\n# First\n\n![Cover](./shared.png)\n\nDraft content.`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "second.md"),
			`---\ntitle: Second\nstatus: published\nvpath: published/second\n---\n# Second\n\n![Cover](./shared.png)\n\nLive content.`,
			"utf8",
		);

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

			const exportedDocument = result.exported[0]!;
			const documentId = exportedDocument.id;

			const contextPath = path.join(outputDir, "api", "context", "index.json");
			const contextPayload = JSON.parse(
				await fs.readFile(contextPath, "utf8"),
			) as {
				documents: Array<{ id: string; meta: { title?: string } }>;
				defaultDocumentId: string | null;
			};
			expect(contextPayload.documents).toHaveLength(1);
			expect(contextPayload.documents[0]?.id).toBe(documentId);
			expect(contextPayload.documents[0]?.meta.title).toBe("Second");
			expect(contextPayload.defaultDocumentId).toBe(documentId);

			const documentPayload = JSON.parse(
				await fs.readFile(
					path.join(outputDir, "api", "documents", documentId, "index.json"),
					"utf8",
				),
			) as { frontMatter: Record<string, unknown>; html: string };
			expect(documentPayload.frontMatter.status).toBe("published");
			expect(documentPayload.html).toMatch(/Live content\./);

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
			await expect(
				fs.stat(path.join(outputDir, "index.html")),
			).resolves.toBeDefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("runs through the CLI and reports the viewer summary", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                status: z.enum(["draft", "published"]).default("draft"),
                vpath: z.string(),
        }),
        virtualPath: {
                param: "vpath",
        },
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
});
