import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SpawnFunction } from "../src/commands/viewer.mts";
import { runViewerCommand } from "../src/commands/viewer.mts";
import { MdfError } from "../src/errors.mts";

interface WorkspaceOptions {
	withConfig?: boolean;
}

async function createWorkspace(
	options: WorkspaceOptions = {},
): Promise<string> {
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

	if (options.withConfig) {
		await fs.mkdir(path.join(root, ".config"), { recursive: true });
		await fs.writeFile(
			path.join(root, ".config", "mdf.mts"),
			[
				'import { defineConfig, z } from "@stakme/mdf/config";',
				"",
				"export default defineConfig({",
				"\tschema: z.object({",
				"\t\ttitle: z.string(),",
				"\t\tcustomPath: z.string().optional(),",
				"\t}),",
				"\tvirtualPath: {",
				'\t\tparam: "customPath",',
				'\t\tseparator: "::",',
				"\t},",
				"});",
			].join("\n"),
			"utf8",
		);
	}
	return root;
}

describe("runViewerCommand", () => {
	it("throws when the site directory is missing", async () => {
		const temp = await fs.mkdtemp(path.join(os.tmpdir(), "mdf-viewer-error-"));
		await fs.mkdir(path.join(temp, "docs"), { recursive: true });

		await expect(
			runViewerCommand({ cwd: temp, directory: "docs" }),
		).rejects.toMatchObject({
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
			directory: "docs",
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
			runViewerCommand({
				cwd: root,
				directory: "docs",
				spawnImpl: spawnStub,
			}),
		).rejects.toBeInstanceOf(MdfError);

		await fs.rm(root, { recursive: true, force: true });
	});

	it("serializes parsed filters into the viewer environment", async () => {
		const root = await createWorkspace();
		const spawnCalls: Array<{
			options: { env?: NodeJS.ProcessEnv };
		}> = [];

		const spawnStub: SpawnFunction = (_command, _args, options) => {
			spawnCalls.push({ options });
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
			directory: "docs",
			filters: ["status = todo", "tags~=feature"],
			spawnImpl: spawnStub,
		});

		expect(spawnCalls).toHaveLength(1);
		const env = spawnCalls[0]?.options.env ?? {};
		expect(env.MDF_FILTERS).toBeDefined();

		const parsed = JSON.parse(env.MDF_FILTERS as string) as Array<{
			path: string[];
			operator: string;
			value: unknown;
		}>;
		expect(parsed).toEqual([
			{ path: ["status"], operator: "exact", value: "todo" },
			{ path: ["tags"], operator: "loose", value: "feature" },
		]);

		await fs.rm(root, { recursive: true, force: true });
	});

	it("forwards virtual path settings from the config to the viewer", async () => {
		const root = await createWorkspace({ withConfig: true });
		const spawnCalls: Array<{ options: { env?: NodeJS.ProcessEnv } }> = [];

		const spawnStub: SpawnFunction = (_command, _args, options) => {
			spawnCalls.push({ options });
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
			directory: "docs",
			spawnImpl: spawnStub,
		});

		expect(spawnCalls).toHaveLength(1);
		const env = spawnCalls[0]?.options.env ?? {};
		expect(env.MDF_VIRTUAL_PATH_PARAM).toBe("customPath");
		expect(env.MDF_VIRTUAL_PATH_SEPARATOR).toBe("::");

		await fs.rm(root, { recursive: true, force: true });
	});
});
