import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SpawnFunction } from "../src/commands/viewer.mts";
import { runViewerCommand } from "../src/commands/viewer.mts";
import { MdfError } from "../src/errors.mts";

async function createWorkspace(): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdf-viewer-test-"));
	await fs.mkdir(path.join(root, "site"), { recursive: true });
	await fs.writeFile(
		path.join(root, "site", "package.json"),
		JSON.stringify({ name: "viewer", version: "0.0.0" }),
		"utf8",
	);
	await fs.mkdir(path.join(root, "docs"), { recursive: true });
	await fs.writeFile(
		path.join(root, "docs", "note.md"),
		"---\ntitle: Test\n---\n",
		"utf8",
	);
	return root;
}

describe("runViewerCommand", () => {
	it("throws when the site directory is missing", async () => {
		const temp = await fs.mkdtemp(path.join(os.tmpdir(), "mdf-viewer-error-"));
		await fs.mkdir(path.join(temp, "docs"), { recursive: true });

		await expect(runViewerCommand({ cwd: temp })).rejects.toMatchObject({
			code: "VIEWER_SITE_NOT_FOUND",
		});

		await fs.rm(temp, { recursive: true, force: true });
	});

	it("launches npm run dev with viewer options", async () => {
		const root = await createWorkspace();
		const spawnCalls: Array<{
			command: string;
			args: readonly string[];
			options: { cwd?: string; env?: NodeJS.ProcessEnv };
		}> = [];

		const spawnStub: SpawnFunction = (command, args, options) => {
			spawnCalls.push({ command, args, options });
			return {
				on(event, handler) {
					if (event === "exit") {
						setImmediate(() => {
							handler(0, null);
						});
					}
					return this;
				},
			} as unknown as ReturnType<SpawnFunction>;
		};

		await runViewerCommand({
			cwd: root,
			docsDir: "docs",
			host: "127.0.0.1",
			port: 4321,
			open: true,
			spawnImpl: spawnStub,
		});

		expect(spawnCalls).toHaveLength(1);
		const call = spawnCalls[0];
		expect(call.command).toBe("npm");
		expect(call.args).toEqual([
			"run",
			"dev",
			"--",
			"--host",
			"127.0.0.1",
			"--port",
			"4321",
			"--open",
		]);
		expect(call.options.cwd).toBe(path.join(root, "site"));
		expect(call.options.env?.MDF_DOCS_DIR).toBe(path.join(root, "docs"));

		await fs.rm(root, { recursive: true, force: true });
	});

	it("surface spawn failures as MdfError", async () => {
		const root = await createWorkspace();
		const error = new Error("boom");
		const spawnStub: SpawnFunction = () =>
			({
				on(event, handler) {
					if (event === "error") {
						setImmediate(() => handler(error));
					}
					return this;
				},
			}) as unknown as ReturnType<SpawnFunction>;

		await expect(
			runViewerCommand({ cwd: root, spawnImpl: spawnStub }),
		).rejects.toBeInstanceOf(MdfError);

		await fs.rm(root, { recursive: true, force: true });
	});
});
