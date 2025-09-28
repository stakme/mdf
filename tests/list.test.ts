import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("markdfm list", () => {
        it("renders a virtual path tree for markdown files", async () => {
                const configSource = `import { defineConfig, z } from "markdfm/config";

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
                                "├── backlog",
                                "│   ├── feature",
                                "│   │   └── todo-a.md",
                                "│   └── todo-b.md",
                                "└── bug_reports",
                                "    └── bug.md",
                        ]);
                } finally {
                        await fs.rm(tempDir, { recursive: true, force: true });
                }
        });

        it("places files without a virtual path at the root level", async () => {
                const configSource = `import { defineConfig, z } from "markdfm/config";

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
                                "├── backlog",
                                "│   └── with.md",
                                "└── root.md",
                        ]);
                } finally {
                        await fs.rm(tempDir, { recursive: true, force: true });
                }
        });

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
                const configSource = `import { defineConfig, z } from "markdfm/config";

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
});
