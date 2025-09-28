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

const ULID_FILE_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}\.md$/u;
const UUID_FILE_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/u;

describe("mdf new", () => {
	it("generates ULID-based file names by default", async () => {
		const tempDir = await setupWorkspace();
		try {
			await execa(nodeBinary, [cliPath, "new", "notes"], {
				cwd: tempDir,
			});

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			expect(entries).toHaveLength(1);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}

			expect(firstEntry).toMatch(ULID_FILE_PATTERN);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("uses UUID file names when configured", async () => {
		const tempDir = await setupWorkspace({
			config: `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                description: z.string(),
                author: z.string(),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
                tags: z.array(z.string()).default(() => []),
        }),
        idGenerator: "uuid",
});`,
		});
		try {
			await execa(nodeBinary, [cliPath, "new", "notes"], {
				cwd: tempDir,
			});

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			expect(entries).toHaveLength(1);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}

			expect(firstEntry).toMatch(UUID_FILE_PATTERN);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("populates required strings with empty values when not provided", async () => {
		const tempDir = await setupWorkspace();
		try {
			await execa(nodeBinary, [cliPath, "new", "notes"], {
				cwd: tempDir,
			});

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			expect(entries).toHaveLength(1);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}

			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter } = parseFrontMatter(content);

			expect(frontMatter.title).toBe("");
			expect(frontMatter.description).toBe("");
			expect(frontMatter.author).toBe("");
			expect(typeof frontMatter.created_at).toBe("string");
			expect(Number.isNaN(Date.parse(frontMatter.created_at as string))).toBe(
				false,
			);
			expect(typeof frontMatter.updated_at).toBe("string");
			expect(Number.isNaN(Date.parse(frontMatter.updated_at as string))).toBe(
				false,
			);
			expect(frontMatter.tags).toEqual([]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("creates a markdown file with validated front matter", async () => {
		const tempDir = await setupWorkspace();
		try {
			const { stdout } = await execa(
				nodeBinary,
				[cliPath, "new", "notes", "--fm", "title=CLI Note"],
				{
					cwd: tempDir,
				},
			);

			expect(stdout.trim()).toMatch(/Created\snotes\//);

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			expect(entries).toHaveLength(1);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}
			const createdFile = path.join(notesDir, firstEntry);

			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter } = parseFrontMatter<{
				title: string;
				description: string;
				author: string;
				created_at: string;
				updated_at: string;
				tags: string[];
			}>(content);

			expect(frontMatter.title).toBe("CLI Note");
			expect(frontMatter.description).toBe("");
			expect(frontMatter.author).toBe("");
			expect(typeof frontMatter.created_at).toBe("string");
			expect(Number.isNaN(Date.parse(frontMatter.created_at))).toBe(false);
			expect(frontMatter.tags).toEqual([]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("respects explicit created_at values provided via CLI", async () => {
		const tempDir = await setupWorkspace();
		const explicitCreatedAt = "2025-09-27T10:15:00.000Z";
		try {
			await execa(
				nodeBinary,
				[
					cliPath,
					"new",
					"notes",
					"--fm",
					"title=Explicit",
					"--fm",
					`created_at=${explicitCreatedAt}`,
				],
				{
					cwd: tempDir,
				},
			);

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			expect(entries).toHaveLength(1);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}
			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter } = parseFrontMatter(content);
			expect(typeof frontMatter.updated_at).toBe("string");

			expect(frontMatter.title).toBe("Explicit");
			expect(frontMatter.description).toBe("");
			expect(frontMatter.author).toBe("");
			expect(frontMatter.created_at).toBe(explicitCreatedAt);
			expect(frontMatter.tags).toEqual([]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("applies schema overrides from a local config file", async () => {
		const tempDir = await setupWorkspace({
			localConfig: `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                author: z.string().default("@stakme"),
        }),
});`,
		});
		try {
			await execa(nodeBinary, [cliPath, "new", "notes"], {
				cwd: tempDir,
			});

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}

			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter } = parseFrontMatter(content);

			expect(frontMatter.author).toBe("@stakme");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("parses array front matter from JSON input", async () => {
		const tempDir = await setupWorkspace();
		try {
			await execa(
				nodeBinary,
				[
					cliPath,
					"new",
					"notes",
					"--fm",
					"title=Has Tags",
					"--fm",
					'tags=["tag1","tag2"]',
				],
				{ cwd: tempDir },
			);

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}
			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter } = parseFrontMatter(content);

			expect(frontMatter.tags).toEqual(["tag1", "tag2"]);
			expect(frontMatter.author).toBe("");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("collects repeated front matter flags into arrays", async () => {
		const tempDir = await setupWorkspace();
		try {
			await execa(
				nodeBinary,
				[
					cliPath,
					"new",
					"notes",
					"--fm",
					"title=Has Many Tags",
					"--fm",
					"tags=tag1",
					"--fm",
					"tags=tag2",
				],
				{ cwd: tempDir },
			);

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}
			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter } = parseFrontMatter(content);

			expect(frontMatter.tags).toEqual(["tag1", "tag2"]);
			expect(frontMatter.author).toBe("");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("uses directory-specific schema definitions when configured", async () => {
		const tempDir = await setupWorkspace({
			config: `import { defineConfig, z } from "@stakme/mdf/config";

const backlogSchema = z.object({
        title: z.string(),
        status: z.enum(["todo", "in_progress", "done"]).default("todo"),
});

const bugSchema = z.object({
        title: z.string(),
        severity: z.enum(["low", "medium", "high"]),
});

export default defineConfig({
        schema: [
                { name: "backlog", glob: "backlog/**", schema: backlogSchema },
                { name: "bug", glob: "bugs/**", schema: bugSchema },
        ],
        defaultSchema: "backlog",
});`,
		});

		try {
			await execa(nodeBinary, [cliPath, "new", "backlog"], { cwd: tempDir });
			await execa(
				nodeBinary,
				[cliPath, "new", "bugs", "--fm", "severity=high"],
				{ cwd: tempDir },
			);

			const backlogDir = path.join(tempDir, "backlog");
			const backlogEntries = await fs.readdir(backlogDir);
			const backlogFileName = backlogEntries[0];
			if (!backlogFileName) {
				throw new Error("Expected backlog schema to produce a file");
			}
			const backlogFile = path.join(backlogDir, backlogFileName);
			const backlogContent = await fs.readFile(backlogFile, "utf8");
			const backlogFrontMatter = parseFrontMatter(backlogContent)
				.frontMatter as {
				title: string;
				status: string;
				severity?: string;
			};

			expect(backlogFrontMatter.status).toBe("todo");
			expect(backlogFrontMatter.severity).toBeUndefined();

			const bugsDir = path.join(tempDir, "bugs");
			const bugEntries = await fs.readdir(bugsDir);
			const bugFileName = bugEntries[0];
			if (!bugFileName) {
				throw new Error("Expected bug schema to produce a file");
			}
			const bugFile = path.join(bugsDir, bugFileName);
			const bugContent = await fs.readFile(bugFile, "utf8");
			const bugFrontMatter = parseFrontMatter(bugContent).frontMatter as {
				title: string;
				severity: string;
				status?: string;
			};

			expect(bugFrontMatter.severity).toBe("high");
			expect(bugFrontMatter.status).toBeUndefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("uses template-specific schema definitions when provided", async () => {
		const tempDir = await setupWorkspace({
			config: `import { defineConfig, z } from "@stakme/mdf/config";

const defaultSchema = z.object({
        title: z.string(),
        status: z.enum(["todo", "in_progress", "done"]).default("todo"),
});

const docsSchema = z.object({
        title: z.string(),
        description: z.string(),
});

export default defineConfig({
        schema: [
                { name: "default", glob: "**", schema: defaultSchema },
                { name: "docs", glob: "docs/**", schema: docsSchema },
        ],
        defaultSchema: "default",
        templates: {
                doc_page: {
                        schema: "docs",
                        frontmatter: {
                                description: "Fill me in",
                        },
                        body: ({ title }) => "# " + title,
                },
        },
});`,
		});

		try {
			await execa(
				nodeBinary,
				[
					cliPath,
					"new",
					"notes",
					"--template",
					"doc_page",
					"--fm",
					"title=Documentation",
				],
				{ cwd: tempDir },
			);

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			const fileName = entries[0];
			if (!fileName) {
				throw new Error("Expected template schema test to create a file");
			}
			const filePath = path.join(notesDir, fileName);
			const content = await fs.readFile(filePath, "utf8");
			const frontMatter = parseFrontMatter(content).frontMatter as {
				title: string;
				description: string;
				status?: string;
			};

			expect(frontMatter.title).toBe("Documentation");
			expect(frontMatter.description).toBe("Fill me in");
			expect(frontMatter.status).toBeUndefined();
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("applies template defaults and body when requested", async () => {
		const tempDir = await setupWorkspace();
		try {
			await execa(
				nodeBinary,
				[cliPath, "new", "notes", "--template", "default"],
				{ cwd: tempDir },
			);

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}

			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter, body } = parseFrontMatter(content);

			expect(frontMatter.title).toBe("[New Note] Title goes here");
			expect(frontMatter.description).toBe("Describe your note here");
			expect(body).toBe(
				`\n# [New Note] Title goes here\n\nDescribe your note here\n\n## What I need\n\n## So I will create...\n`,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("applies the configured default template when not specified", async () => {
		const tempDir = await setupWorkspace({
			config: `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                description: z.string(),
                author: z.string(),
                created_at: z
                        .string()
                        .datetime()
                        .default(() => new Date().toISOString()),
                updated_at: z
                        .string()
                        .datetime()
                        .default(() => new Date().toISOString()),
                tags: z.array(z.string()).default(() => []),
        }),
        templates: {
                default: {
                        frontmatter: {
                                title: "[New Note] Title goes here",
                                description: "Describe your note here",
                        },
                        body: ({ title, description }) =>
                                "# " +
                                title +
                                "\\n\\n" +
                                description +
                                "\\n\\n## What I need\\n\\n## So I will create...",
                },
        },
        defaultTemplate: "default",
});`,
		});
		try {
			await execa(nodeBinary, [cliPath, "new", "notes"], { cwd: tempDir });

			const notesDir = path.join(tempDir, "notes");
			const entries = await fs.readdir(notesDir);
			const [firstEntry] = entries;
			if (!firstEntry) {
				throw new Error("Expected the command to create a file");
			}

			const createdFile = path.join(notesDir, firstEntry);
			const content = await fs.readFile(createdFile, "utf8");
			const { frontMatter, body } = parseFrontMatter(content);

			expect(frontMatter.title).toBe("[New Note] Title goes here");
			expect(frontMatter.description).toBe("Describe your note here");
			expect(body).toBe(
				`\n# [New Note] Title goes here\n\nDescribe your note here\n\n## What I need\n\n## So I will create...\n`,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
