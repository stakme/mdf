import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG_SOURCE } from "../src/commands/init.mts";
import { cliPath, nodeBinary } from "./helpers";

describe("mdf init", () => {
	it("creates a starter config when none exists", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdf-init-"));

		try {
			const { stdout } = await execa(nodeBinary, [cliPath, "init"], {
				cwd: tempDir,
			});

			const configPath = path.join(tempDir, ".config", "mdf.mts");
			const content = await fs.readFile(configPath, "utf8");

			expect(content).toBe(DEFAULT_CONFIG_SOURCE);
			expect(stdout.trim()).toBe("Created ./.config/mdf.mts");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("fails when a config already exists", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdf-init-"));

		try {
			const configDir = path.join(tempDir, ".config");
			await fs.mkdir(configDir, { recursive: true });
			const existingPath = path.join(configDir, "mdf.mts");
			await fs.writeFile(existingPath, "export default {}\n", "utf8");

			await expect(
				execa(nodeBinary, [cliPath, "init"], { cwd: tempDir }),
			).rejects.toMatchObject({
				exitCode: 1,
				stderr: expect.stringContaining(
					"Config file already exists at ./.config/mdf.mts",
				),
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
