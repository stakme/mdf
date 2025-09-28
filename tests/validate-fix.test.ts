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

async function createInvalidNote(baseDir: string): Promise<string> {
	const notesDir = path.join(baseDir, "notes");
	await fs.mkdir(notesDir, { recursive: true });
	const notePath = path.join(notesDir, "missing-description.md");
	const now = new Date().toISOString();
	const content =
		`---\n` +
		`title: Missing Description\n` +
		`author: test-user\n` +
		`created_at: ${now}\n` +
		`updated_at: ${now}\n` +
		`tags: []\n` +
		`---\n` +
		`\n` +
		`Some content.\n`;
	await fs.writeFile(notePath, content, "utf8");
	return notePath;
}

async function createNoteMissingCreatedAt(baseDir: string): Promise<string> {
	const notesDir = path.join(baseDir, "notes");
	await fs.mkdir(notesDir, { recursive: true });
	const notePath = path.join(notesDir, "missing-created-at.md");
	const now = new Date().toISOString();
	const content =
		`---\n` +
		`title: Missing Created At\n` +
		`description: Some description\n` +
		`author: test-user\n` +
		`updated_at: ${now}\n` +
		`tags: []\n` +
		`---\n` +
		`\n` +
		`Content body.\n`;
	await fs.writeFile(notePath, content, "utf8");
	return notePath;
}

async function createInvalidNoteWithoutBlankLine(
	baseDir: string,
): Promise<string> {
	const notesDir = path.join(baseDir, "notes");
	await fs.mkdir(notesDir, { recursive: true });
	const notePath = path.join(notesDir, "missing-description-no-blank-line.md");
	const now = new Date().toISOString();
	const content = [
		"---",
		"title: Missing Description",
		"author: test-user",
		`created_at: ${now}`,
		`updated_at: ${now}`,
		"tags: []",
		"---",
		"# Some content.",
		"",
	].join("\n");
	await fs.writeFile(notePath, content, "utf8");
	return notePath;
}

describe("mdf validate", () => {
	it("reports files missing required fields", async () => {
		const tempDir = await setupWorkspace();
		try {
			const invalidFile = await createInvalidNote(tempDir);

			const result = await execa(nodeBinary, [cliPath, "validate", "notes"], {
				cwd: tempDir,
				reject: false,
			});

			expect(result.exitCode).toBe(1);
			const relative = path.relative(tempDir, invalidFile);
			const expectedPath = relative.startsWith(".")
				? relative
				: `./${relative}`;
			expect(result.stderr).toContain(
				`${expectedPath}: description field is missing`,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("reports fields satisfied only by schema defaults", async () => {
		const tempDir = await setupWorkspace();
		try {
			const invalidFile = await createNoteMissingCreatedAt(tempDir);

			const result = await execa(nodeBinary, [cliPath, "validate", "notes"], {
				cwd: tempDir,
				reject: false,
			});

			expect(result.exitCode).toBe(1);
			const relative = path.relative(tempDir, invalidFile);
			const expectedPath = relative.startsWith(".")
				? relative
				: `./${relative}`;
			expect(result.stderr).toContain(
				`${expectedPath}: created_at field is missing`,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});

describe("mdf fix", () => {
	it("fills missing fields using provided defaults", async () => {
		const tempDir = await setupWorkspace();
		try {
			const invalidFile = await createInvalidNote(tempDir);

			const fixResult = await execa(
				nodeBinary,
				[
					cliPath,
					"fix",
					"--fm",
					'description="TODO: Add description here"',
					"notes",
				],
				{
					cwd: tempDir,
				},
			);

			expect(fixResult.exitCode).toBe(0);
			const relative = path.relative(tempDir, invalidFile);
			const expectedPath = relative.startsWith(".")
				? relative
				: `./${relative}`;
			expect(fixResult.stdout).toContain(`Updated ${expectedPath}`);

			const content = await fs.readFile(invalidFile, "utf8");
			const { frontMatter } = parseFrontMatter<{
				title: string;
				description: string;
				author: string;
				created_at: string;
				updated_at: string;
				tags: string[];
			}>(content);

			expect(frontMatter.description).toBe("TODO: Add description here");

			const validateResult = await execa(
				nodeBinary,
				[cliPath, "validate", "notes"],
				{
					cwd: tempDir,
					reject: false,
				},
			);
			expect(validateResult.exitCode).toBe(0);
			const lines = validateResult.stdout.trim().split(/\r?\n/);
			expect(lines[0]).toBe("1 file is valid");
			expect(lines[1]).toBe("- ./notes/missing-description.md");
			expect(lines).toHaveLength(2);
			expect(validateResult.stderr).toBe("");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("does not add a blank line after front matter when fixing", async () => {
		const tempDir = await setupWorkspace();
		try {
			const invalidFile = await createInvalidNoteWithoutBlankLine(tempDir);

			const fixResult = await execa(
				nodeBinary,
				[
					cliPath,
					"fix",
					"--fm",
					'description="TODO: Add description here"',
					"notes",
				],
				{
					cwd: tempDir,
				},
			);

			expect(fixResult.exitCode).toBe(0);

			const content = await fs.readFile(invalidFile, "utf8");
			const { body } = parseFrontMatter(content);
			expect(body.startsWith("#")).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
