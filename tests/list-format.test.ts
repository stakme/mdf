import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { cliPath, nodeBinary, setupWorkspace } from "./helpers";

describe("mdf list --format", () => {
	it("filters notes using front matter and renders templates", async () => {
		const tempDir = await setupWorkspace();
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const sharedFrontMatter = `description: Sample note\nauthor: tester\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z`;

		await fs.writeFile(
			path.join(notesDir, "note-a.md"),
			`---\ntitle: New Note\n${sharedFrontMatter}\nstatus: todo\ntags:\n  - new feature\n  - refactoring\n---\nBody\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "note-b.md"),
			`---\ntitle: Next Note\n${sharedFrontMatter}\nstatus: todo\ntags:\n  - new feature\n---\nBody\n`,
			"utf8",
		);

		await fs.writeFile(
			path.join(notesDir, "note-c.md"),
			`---\ntitle: Archived Note\n${sharedFrontMatter}\nstatus: done\ntags:\n  - refactoring\n---\nBody\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[
					cliPath,
					"list",
					"notes",
					"--filter",
					"status: todo",
					"--filter",
					"tags: 'new feature'",
					"--format",
					"[status: {{status}}] {{title}} ({{tags:, }})",
				],
				{ cwd: tempDir },
			);

			const lines = stdout.trim().split("\n").filter(Boolean);
			expect(lines).toEqual([
				"[status: todo] New Note (new feature, refactoring)",
				"[status: todo] Next Note (new feature)",
			]);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("interprets escaped newline sequences in format templates", async () => {
		const tempDir = await setupWorkspace();
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		await fs.writeFile(
			path.join(notesDir, "note.md"),
			`---\ntitle: Escaped Output\nstatus: done\ntags:\n  - alpha\n  - beta\n---\n`,
			"utf8",
		);

		try {
			const { stdout } = await execa(
				nodeBinary,
				[
					cliPath,
					"list",
					"notes",
					"--format",
					"[{{f.status}}]\\n{{title}} :: {{tags:\\n}}",
				],
				{ cwd: tempDir },
			);

			expect(stdout.trim()).toBe("[done]\nEscaped Output :: alpha\nbeta");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("reports invalid filter expressions", async () => {
		const tempDir = await setupWorkspace();
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });
		await fs.writeFile(
			path.join(notesDir, "note.md"),
			`---\ntitle: Lone Note\nauthor: tester\ndescription: One\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z\nstatus: todo\ntags: []\n---\n`,
			"utf8",
		);

		try {
			await expect(
				execa(
					nodeBinary,
					[
						cliPath,
						"list",
						"notes",
						"--filter",
						"status todo",
						"--format",
						"{{title}}",
					],
					{
						cwd: tempDir,
						reject: true,
					},
				),
			).rejects.toMatchObject({
				exitCode: 1,
				stderr: expect.stringContaining("Invalid filter expression"),
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("exposes reserved path placeholders in the output template", async () => {
		const tempDir = await setupWorkspace();
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const notePath = path.join(notesDir, "note.md");
		await fs.writeFile(
			notePath,
			`---\ntitle: Lone Note\nauthor: tester\nstatus: done\n---\n`,
			"utf8",
		);

		const relativePath =
			path.relative(tempDir, notePath) || path.basename(notePath);
		const displayPath = relativePath.startsWith("..")
			? relativePath
			: relativePath.startsWith(".")
				? relativePath
				: `./${relativePath}`;

		try {
			const absoluteNotePath = await fs.realpath(notePath);
			const { stdout } = await execa(
				nodeBinary,
				[
					cliPath,
					"list",
					"notes",
					"--format",
					"{{relpath}}|{{filename}}|{{abspath}}|{{file}}|{{f.title}}",
				],
				{ cwd: tempDir },
			);

			expect(stdout.trim()).toBe(
				`${relativePath}|${path.basename(notePath)}|${absoluteNotePath}|${displayPath}|Lone Note`,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("renders markdown headings with heading placeholders", async () => {
		const tempDir = await setupWorkspace();
		const notesDir = path.join(tempDir, "notes");
		await fs.mkdir(notesDir, { recursive: true });

		const sharedFrontMatter = `description: Outline note\nauthor: tester\ncreated_at: 2025-09-27T00:00:00.000Z\nupdated_at: 2025-09-27T00:00:00.000Z\ntags:\n  - docs`;

		const notePath = path.join(notesDir, "note.md");
		await fs.writeFile(
			notePath,
			`---\ntitle: Outline Note\n${sharedFrontMatter}\nstatus: todo\n---\n\n# Outline Note\n\n## Intro\n\n### Deep Dive\n\n#### Appendix\n\nBody text.\n\n\`\`\`\n# Ignored heading\n\`\`\`\n`,
			"utf8",
		);

		try {
			const { stdout: h3Output } = await execa(
				nodeBinary,
				[cliPath, "list", "notes", "--format", "{{h3}}"],
				{ cwd: tempDir },
			);

			expect(h3Output.trim()).toBe(
				[
					"# Outline Note (L:12)",
					"## Intro (L:14)",
					"### Deep Dive (L:16)",
				].join("\n"),
			);

			const { stdout: h6Output } = await execa(
				nodeBinary,
				[cliPath, "list", "notes", "--format", "{{h6:\n}}"],
				{ cwd: tempDir },
			);

			expect(h6Output.trim()).toBe(
				[
					"# Outline Note (L:12)",
					"## Intro (L:14)",
					"### Deep Dive (L:16)",
					"#### Appendix (L:18)",
				].join("\n"),
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
