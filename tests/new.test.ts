import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const cliPath = path.join(projectRoot, "dist", "cli.mjs");
const nodeBinary =
	process.execPath ?? "/Users/stakme/.nvm/versions/node/v24.9.0/bin/node";

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
				expect(typeof frontMatter.created_at).toBe("string");
				expect(Number.isNaN(Date.parse(frontMatter.created_at as string))).toBe(false);
				expect(typeof frontMatter.updated_at).toBe("string");
				expect(Number.isNaN(Date.parse(frontMatter.updated_at as string))).toBe(false);
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
				created_at: string;
				updated_at: string;
			}>(content);

			expect(frontMatter.title).toBe("CLI Note");
			expect(typeof frontMatter.created_at).toBe("string");
			expect(Number.isNaN(Date.parse(frontMatter.created_at))).toBe(false);
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
				expect(frontMatter.created_at).toBe(explicitCreatedAt);
			} finally {
				await fs.rm(tempDir, { recursive: true, force: true });
			}
		});
	});

async function setupWorkspace(): Promise<string> {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markdfm-test-"));
	const configDir = path.join(tempDir, ".config");
	await fs.mkdir(configDir, { recursive: true });

	const configFile = path.join(configDir, "markdfm.mts");
const configSource = `import { defineConfig, z } from "markdfm/config";

export default defineConfig({
	schema: z.object({
		title: z.string(),
		created_at: z.string().datetime().default(() => new Date().toISOString()),
		updated_at: z.string().datetime().default(() => new Date().toISOString()),
	}),
});`;
	await fs.writeFile(configFile, configSource, "utf8");

	return tempDir;
}

function parseFrontMatter<T extends Record<string, unknown>>(content: string): {
	frontMatter: T;
	body: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		throw new Error("Front matter not found");
	}
	const frontMatter = YAML.parse(match[1] ?? "");
	const body = match[2] ?? "";
	return { frontMatter, body };
}
