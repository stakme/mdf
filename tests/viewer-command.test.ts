import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
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
			expect(doc.html).toContain("<h1");

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
			expect(html).not.toContain("Beta");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
