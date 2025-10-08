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

describe("mdf append", () => {
	it("moves files into a note directory and appends image tags", async () => {
		const tempDir = await setupWorkspace();
		try {
			const noteDirectory = path.join(tempDir, "docs");
			await fs.mkdir(noteDirectory, { recursive: true });
			const notePath = path.join(noteDirectory, "100-overview.md");
			await fs.writeFile(
				notePath,
				`---\ntitle: Overview\nvpath: /overview\nchapter: 1\n---\n\nInitial content.\n`,
				"utf8",
			);

			const sourceImage = path.join(tempDir, "diagram-sketch.png");
			await fs.writeFile(sourceImage, "fake image", "utf8");

			const { stdout } = await execa(
				nodeBinary,
				[cliPath, "append", "docs/100-overview.md", "diagram-sketch.png"],
				{ cwd: tempDir },
			);

			expect(stdout).toContain(
				"Appended ./docs/100-overview/diagram-sketch.png",
			);

			const movedImage = path.join(
				tempDir,
				"docs",
				"100-overview",
				"diagram-sketch.png",
			);
			const movedStats = await fs.stat(movedImage);
			expect(movedStats.isFile()).toBe(true);

			const noteContent = await fs.readFile(notePath, "utf8");
			const { body } = parseFrontMatter(noteContent);
			expect(body).toBe(
				"\nInitial content.\n\n![diagram sketch](100-overview/diagram-sketch.png)\n",
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("fails when the source file is missing", async () => {
		const tempDir = await setupWorkspace();
		try {
			const noteDirectory = path.join(tempDir, "docs");
			await fs.mkdir(noteDirectory, { recursive: true });
			const notePath = path.join(noteDirectory, "100-overview.md");
			await fs.writeFile(
				notePath,
				`---\ntitle: Overview\nvpath: /overview\nchapter: 1\n---\n\nInitial content.\n`,
				"utf8",
			);

			await expect(
				execa(
					nodeBinary,
					[cliPath, "append", "docs/100-overview.md", "missing.png"],
					{ cwd: tempDir },
				),
			).rejects.toMatchObject({
				exitCode: 1,
				stderr: expect.stringContaining("File not found"),
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
