import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("mdf list", () => {
	it("renders a virtual path tree for markdown files", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "TODO");
		await fs.mkdir(notesDir, { recursive: true });

		const sharedFrontMatter = `status: todo\nauthor: tester\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z`;

		await fs.writeFile(
			path.join(notesDir, "todo-a.md"),
			`---\ntitle: Feature work\nvpath: backlog/feature\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "todo-b.md"),
			`---\ntitle: Planning\nvpath: backlog\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "bug.md"),
			`---\ntitle: Fix bug\nvpath: bug_reports\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(nodeBinary, [cliPath, "list", "TODO"], {
				cwd: tempDir,
			});

			const lines = stdout.trim().split("\n");
			expect(lines).toEqual([
				"./TODO",
				"├── backlog",
				"│   ├── feature",
				"│   │   └── Feature work (./TODO/todo-a.md)",
				"│   └── Planning (./TODO/todo-b.md)",
				"└── bug_reports",
				"    └── Fix bug (./TODO/bug.md)",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("filters entries by virtual path prefix", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "TODO");
		await fs.mkdir(notesDir, { recursive: true });

		const sharedFrontMatter = `status: todo\nauthor: tester\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z`;

		await fs.writeFile(
			path.join(notesDir, "todo-a.md"),
			`---\ntitle: Feature work\nvpath: backlog/feature\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "todo-b.md"),
			`---\ntitle: Planning\nvpath: backlog\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[cliPath, "list", "--vpath", "backlog/feature", "TODO"],
				{
					cwd: tempDir,
				},
			);

			const lines = stdout.trim().split("\n");
			expect(lines).toEqual([
				"./TODO",
				"└── backlog",
				"    └── feature",
				"        └── Feature work (./TODO/todo-a.md)",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("prints only document ids when quiet flag is provided", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "TODO");
		await fs.mkdir(notesDir, { recursive: true });

		const sharedFrontMatter = `status: todo\nauthor: tester\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z`;

		await fs.writeFile(
			path.join(notesDir, "todo-a.md"),
			`---\ntitle: Feature work\nvpath: backlog/feature\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "todo-b.md"),
			`---\ntitle: Planning\nvpath: backlog\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "bug.md"),
			`---\ntitle: Fix bug\nvpath: bug_reports\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		const nestedDir = path.join(notesDir, "nested");
		await fs.mkdir(nestedDir, { recursive: true });
		await fs.writeFile(
			path.join(nestedDir, "note.md"),
			`---\ntitle: Nested note\nvpath: backlog/nested\n${sharedFrontMatter}\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[cliPath, "list", "-q", "TODO"],
				{
					cwd: tempDir,
				},
			);

			const lines = stdout.trim().split("\n");
			expect(lines).toEqual([
				"./TODO/todo-a.md",
				"./TODO/bug.md",
				"./TODO/nested/note.md",
				"./TODO/todo-b.md",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("places files without a virtual path at the root level", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string().optional(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "with.md"),
			`---\ntitle: With Path\nvpath: backlog\nauthor: tester\nstatus: todo\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "root.md"),
			`---\ntitle: Root Path\nauthor: tester\nstatus: todo\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(nodeBinary, [cliPath, "list", "notes"], {
				cwd: tempDir,
			});

			const lines = stdout.trim().split("\n");
			expect(lines).toEqual([
				"./notes",
				"├── backlog",
				"│   └── With Path (./notes/with.md)",
				"└── Root Path (./notes/root.md)",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("filters entries using front matter values", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "TODO");
		await fs.mkdir(notesDir, { recursive: true });

		const baseFrontMatter = `author: tester\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z`;

		await fs.writeFile(
			path.join(notesDir, "todo-task.md"),
			`---\ntitle: Todo Task\nvpath: backlog/todo\nstatus: todo\n${baseFrontMatter}\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "done-task.md"),
			`---\ntitle: Done Task\nvpath: backlog/done\nstatus: done\n${baseFrontMatter}\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[cliPath, "list", "--filter", "status=todo", "TODO"],
				{
					cwd: tempDir,
				},
			);

			const lines = stdout.trim().split("\n");
			expect(lines).toEqual([
				"./TODO",
				"└── backlog",
				"    └── todo",
				"        └── Todo Task (./TODO/todo-task.md)",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("warns and ignores invalid markdown files by default", async () => {
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
			`---\ntitle: Valid\nvpath: backlog\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "broken.md"),
			"# Missing front matter\n",
			"utf8",
		);

		try {
			const result = await execa(nodeBinary, [cliPath, "list", "notes"], {
				cwd: tempDir,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim().split("\n")).toEqual([
				"./notes",
				"└── backlog",
				"    └── Valid (./notes/valid.md)",
			]);
			expect(result.stderr).toContain(
				"Ignoring invalid Markdown file ./notes/broken.md: Front matter not found",
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("fails in strict mode when encountering invalid markdown files", async () => {
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
			path.join(notesDir, "broken.md"),
			"# Missing front matter\n",
			"utf8",
		);

		try {
			const result = await execa(
				nodeBinary,
				[cliPath, "list", "--strict", "notes"],
				{ cwd: tempDir, reject: false },
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Front matter not found");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it(
		"supports loose, prefix, and suffix filter operators",
		{ timeout: 15000 },
		async () => {
			const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
                status: z.string(),
                category: z.string(),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
                separator: "/",
        },
});`;

			const tempDir = await setupWorkspace({ config: configSource });
			const notesDir = path.join(tempDir, "TODO");
			await fs.mkdir(notesDir, { recursive: true });

			const shared = `author: tester\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z`;

			await fs.writeFile(
				path.join(notesDir, "feature-task.md"),
				`---\ntitle: Feature Task\nvpath: backlog/feature\nstatus: todo\ncategory: enhancements\n${shared}\n---\n`,
				"utf8",
			);

			await fs.writeFile(
				path.join(notesDir, "feature-doc.md"),
				`---\ntitle: Feature Document\nvpath: backlog/docs\nstatus: done\ncategory: enhancements\n${shared}\n---\n`,
				"utf8",
			);

			await fs.writeFile(
				path.join(notesDir, "bug-task.md"),
				`---\ntitle: Bug Task\nvpath: bugs\nstatus: todo\ncategory: fixes\n${shared}\n---\n`,
				"utf8",
			);

			const formatTemplate = "{{title}}|{{status}}";

			try {
				const loose = await execa(
					nodeBinary,
					[
						cliPath,
						"list",
						"--filter",
						"title~=feature",
						"--format",
						formatTemplate,
						"TODO",
					],
					{ cwd: tempDir },
				);

				const looseLines = loose.stdout
					.trim()
					.split("\n")
					.filter(Boolean)
					.sort();
				expect(looseLines).toEqual([
					"Feature Document|done",
					"Feature Task|todo",
				]);

				const prefix = await execa(
					nodeBinary,
					[
						cliPath,
						"list",
						"--filter",
						"status^=to",
						"--format",
						formatTemplate,
						"TODO",
					],
					{ cwd: tempDir },
				);

				const prefixLines = prefix.stdout
					.trim()
					.split("\n")
					.filter(Boolean)
					.sort();
				expect(prefixLines).toEqual(["Bug Task|todo", "Feature Task|todo"]);

				const suffix = await execa(
					nodeBinary,
					[
						cliPath,
						"list",
						"--filter",
						"title$=task",
						"--format",
						formatTemplate,
						"TODO",
					],
					{ cwd: tempDir },
				);

				const suffixLines = suffix.stdout
					.trim()
					.split("\n")
					.filter(Boolean)
					.sort();
				expect(suffixLines).toEqual(["Bug Task|todo", "Feature Task|todo"]);
			} finally {
				await fs.rm(tempDir, { recursive: true, force: true });
			}
		},
	);

	it("fails when virtual path configuration is missing", async () => {
		const tempDir = await setupWorkspace();
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "note.md"),
			`---\ntitle: Lone Note\nauthor: tester\ndescription: Sample\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z\ntags: []\n---\n`,
			"utf8",
		);

		try {
			await expect(
				execa(nodeBinary, [cliPath, "list", "notes"], {
					cwd: tempDir,
					reject: true,
				}),
			).rejects.toMatchObject({
				exitCode: 1,
				stderr: expect.stringContaining("Virtual path configuration not found"),
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("fails when a markdown file is missing the virtual path field", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                vpath: z.string(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
                author: z.string(),
                tags: z.array(z.string()).default(() => []),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
        }),
        virtualPath: {
                param: "vpath",
        },
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "note.md"),
			`---\ntitle: Lone Note\nvpath:\n  - backlog\nauthor: tester\nstatus: todo\ntags: []\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z\n---\n`,
			"utf8",
		);

		try {
			await expect(
				execa(nodeBinary, [cliPath, "list", "notes"], {
					cwd: tempDir,
					reject: true,
				}),
			).rejects.toMatchObject({
				exitCode: 1,
				stderr: expect.stringContaining(
					'Front matter field "vpath" must be a string',
				),
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("sorts formatted output using schema-defined comparator", async () => {
		const configSource = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: {
                docs: {
                        glob: "notes/**",
                        schema: z.object({
                                title: z.string(),
                                created_at: z.string(),
                        }),
                        sort: (a, b) => b.created_at.localeCompare(a.created_at),
                },
                default: {
                        schema: z.object({
                                title: z.string(),
                        }),
                },
        },
        defaultSchema: "default",
});`;

		const tempDir = await setupWorkspace({ config: configSource });
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "alpha.md"),
			`---\ntitle: Alpha\ncreated_at: 2024-01-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "beta.md"),
			`---\ntitle: Beta\ncreated_at: 2025-01-01T00:00:00.000Z\n---\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "gamma.md"),
			`---\ntitle: Gamma\ncreated_at: 2023-06-15T00:00:00.000Z\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[cliPath, "list", "--format", "{{title}}|{{created_at}}", "notes"],
				{ cwd: tempDir },
			);

			expect(stdout.trim().split("\n")).toEqual([
				"Beta|2025-01-01T00:00:00.000Z",
				"Alpha|2024-01-01T00:00:00.000Z",
				"Gamma|2023-06-15T00:00:00.000Z",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
