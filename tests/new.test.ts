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

describe("markdfm new", () => {
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
                                created_at: string;
                                updated_at: string;
                                tags: string[];
                        }>(content);

                        expect(frontMatter.title).toBe("CLI Note");
                        expect(frontMatter.description).toBe("");
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
			expect(frontMatter.created_at).toBe(explicitCreatedAt);
			expect(frontMatter.tags).toEqual([]);
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
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
