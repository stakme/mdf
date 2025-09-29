import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import {
	cliPath,
	nodeBinary,
	parseFrontMatter,
	setupWorkspace,
} from "./helpers";

describe("mdf update", () => {
	it("applies explicit values and schema defaults", async () => {
		const tempDir = await setupWorkspace();
		try {
			const notesDir = path.join(tempDir, "notes");
			await fs.mkdir(notesDir, { recursive: true });
			const ticketPath = path.join(notesDir, "ticket.md");
			const initialTimestamp = "2024-01-01T00:00:00.000Z";
			const initialContent =
				`---\n` +
				`title: Implement feature\n` +
				`description: Something to do\n` +
				`author: test-user\n` +
				`status: in-progress\n` +
				`created_at: ${initialTimestamp}\n` +
				`updated_at: ${initialTimestamp}\n` +
				`tags: []\n` +
				`---\n` +
				`\n` +
				`Body text.\n`;
			await fs.writeFile(ticketPath, initialContent, "utf8");

			const result = await execa(
				nodeBinary,
				[
					cliPath,
					"update",
					"--fm",
					"status=done",
					"--fm",
					"updated_at",
					path.relative(tempDir, ticketPath),
				],
				{
					cwd: tempDir,
				},
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Updated ./notes/ticket.md");

			const fileContent = await fs.readFile(ticketPath, "utf8");
			const { frontMatter } = parseFrontMatter<{
				status: string;
				updated_at: string;
			}>(fileContent);

			expect(frontMatter.status).toBe("done");
			expect(frontMatter.updated_at).not.toBe(initialTimestamp);
			expect(Number.isNaN(Date.parse(frontMatter.updated_at))).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("reports fields without available defaults", async () => {
		const tempDir = await setupWorkspace({
			config: `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                status: z.enum(["todo", "done"]),
        }),
});`,
		});
		try {
			const notesDir = path.join(tempDir, "notes");
			await fs.mkdir(notesDir, { recursive: true });
			const ticketPath = path.join(notesDir, "ticket.md");
			const content =
				`---\n` +
				`title: Implement feature\n` +
				`status: todo\n` +
				`---\n` +
				`\n` +
				`Body text.\n`;
			await fs.writeFile(ticketPath, content, "utf8");

			const result = await execa(
				nodeBinary,
				[
					cliPath,
					"update",
					"--fm",
					"status",
					path.relative(tempDir, ticketPath),
				],
				{
					cwd: tempDir,
					reject: false,
				},
			);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).not.toContain("Updated");
			expect(result.stderr).toContain("No default value available for status");

			const fileContent = await fs.readFile(ticketPath, "utf8");
			const { frontMatter } = parseFrontMatter<{ status: string }>(fileContent);
			expect(frontMatter.status).toBe("todo");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("warns and skips invalid files without failing by default", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
        }),
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		try {
			const notesDir = path.join(tempDir, "notes");
			await fs.mkdir(notesDir, { recursive: true });

			const validPath = path.join(notesDir, "valid.md");
			await fs.writeFile(validPath, `---\ntitle: Initial\n---\n`, "utf8");

			const invalidPath = path.join(notesDir, "broken.md");
			await fs.writeFile(invalidPath, "# Missing front matter\n", "utf8");

			const result = await execa(
				nodeBinary,
				[
					cliPath,
					"update",
					"--fm",
					"title=Updated",
					path.relative(tempDir, validPath),
					path.relative(tempDir, invalidPath),
				],
				{ cwd: tempDir, reject: false },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Updated ./notes/valid.md");
			expect(result.stderr).toContain(
				"Ignoring invalid Markdown file ./notes/broken.md: Front matter not found",
			);

			const fileContent = await fs.readFile(validPath, "utf8");
			const { frontMatter } = parseFrontMatter<{ title: string }>(fileContent);
			expect(frontMatter.title).toBe("Updated");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
