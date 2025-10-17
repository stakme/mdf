import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("mdf run", () => {
	it("executes a configured alias with quoted arguments", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                default: defineSchema({
                        schema: z.object({
                                title: z.string(),
                                vpath: z.string(),
                                status: z.enum(["todo", "done"]).default("todo"),
                        }),
                        vpath: ({ fm }) => fm.vpath,
                }),
        },
        defaultSchema: "default",
        aliases: {
                todo: 'list --filter "status=todo" ./TODO',
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const todoDir = path.join(tempDir, "TODO");
		await fs.mkdir(todoDir, { recursive: true });

		const sharedFrontMatter = `status: todo\ntitle: Feature\nvpath: backlog/feature`;
		await fs.writeFile(
			path.join(todoDir, "feature.md"),
			`---\n${sharedFrontMatter}\n---\nBody`,
			"utf8",
		);

		try {
			const { stdout } = await execa(nodeBinary, [cliPath, "run", "todo"], {
				cwd: tempDir,
			});

			const lines = stdout.trim().split("\n");
			expect(lines).toEqual([
				"./TODO",
				"└── backlog",
				"    └── feature",
				"        └── Feature (./TODO/feature.md)",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("informs the user when an alias is not defined", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
        }),
});`;

		const tempDir = await setupWorkspace({ config: configSource });

		try {
			const result = await execa(nodeBinary, [cliPath, "run", "missing"], {
				cwd: tempDir,
				reject: false,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr.trim()).toContain(
				'Alias "missing" not found in .config/mdf.mts',
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("reports alias cycles to prevent infinite recursion", async () => {
		const configSource = `import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
        }),
        aliases: {
                loop: 'run loop',
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });

		try {
			const result = await execa(nodeBinary, [cliPath, "run", "loop"], {
				cwd: tempDir,
				reject: false,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr.trim()).toContain(
				'Detected a cycle while resolving alias "loop"',
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
