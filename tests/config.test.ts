import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("mdf config", () => {
	it("supports heterogeneous schema definitions", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: [
                {
                        name: "docs",
                        glob: "docs/**",
                        schema: z.object({
                                title: z.string().min(1),
                                description: z.string().optional(),
                                vpath: z.string().min(1),
                                date: z.iso.date().optional(),
                                tags: z.array(z.string()).default(() => []),
                                draft: z.boolean().default(false),
                                author: z.string().optional(),
                        }),
                        vpath: (context) => context.fm.vpath,
                },
                {
                        name: "default",
                        glob: "**",
                        schema: z.object({
                                title: z.string(),
                                vpath: z.string().optional(),
                                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                                author: z.string().optional(),
                                tags: z.array(z.string()).default(() => []),
                                created_at: z.iso.datetime().default(() => new Date().toISOString()),
                                updated_at: z.iso.datetime().default(() => new Date().toISOString()),
                        }),
                        vpath: (context) => context.fm.vpath ?? "/",
                },
        ],
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const docsDir = path.join(tempDir, "docs");
		const todoDir = path.join(tempDir, "TODO");
		await fs.mkdir(docsDir, { recursive: true });
		await fs.mkdir(todoDir, { recursive: true });

		await fs.writeFile(
			path.join(docsDir, "guide.md"),
			`---\ntitle: Getting started\ndescription: Walkthrough\nvpath: docs/getting-started\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(todoDir, "task.md"),
			`---\ntitle: Fix issue\nvpath: backlog/issues\nstatus: todo\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T01:00:00.000Z\n---\n`,
			"utf8",
		);

		try {
			const { stdout: docsList } = await execa(
				nodeBinary,
				[cliPath, "list", "docs"],
				{ cwd: tempDir },
			);
			expect(docsList).toContain("Getting started (./docs/guide.md)");

			const { stdout: todoList } = await execa(
				nodeBinary,
				[cliPath, "list", "TODO"],
				{ cwd: tempDir },
			);
			expect(todoList).toContain("Fix issue (./TODO/task.md)");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("exposes defineSchema helper to TypeScript configs", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                                vpath: z.string().optional(),
                        }),
                        vpath: (context) => context.fm.vpath ?? "/",
                }),
        },
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const todoDir = path.join(tempDir, "TODO");
		await fs.mkdir(todoDir, { recursive: true });

		await fs.writeFile(
			path.join(todoDir, "task.md"),
			`---\ntitle: Fix schema import\nstatus: todo\nvpath: todo/fix-schema-import\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(nodeBinary, [cliPath, "list", "TODO"], {
				cwd: tempDir,
			});
			expect(stdout).toContain("Fix schema import (./TODO/task.md)");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
