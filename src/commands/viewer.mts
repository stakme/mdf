import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { MdfError } from "../errors.mts";

export interface ViewerCommandOptions {
	cwd: string;
	docsDir?: string;
	host?: string;
	port?: number;
	open?: boolean;
	spawnImpl?: SpawnFunction;
}

export type SpawnFunction = (
	command: string,
	args: readonly string[],
	options: SpawnOptions,
) => ChildProcess;

export async function runViewerCommand(
	options: ViewerCommandOptions,
): Promise<void> {
	const siteDir = path.resolve(options.cwd, "site");
	const docsDirInput = options.docsDir ?? "docs";
	const docsDir = path.resolve(options.cwd, docsDirInput);

	await ensureDirectoryExists(
		siteDir,
		"VIEWER_SITE_NOT_FOUND",
		() =>
			`Viewer project not found at ${formatDisplayPath(siteDir, options.cwd)}. Create the Astro app under a "site" directory.`,
	);

	await ensureDirectoryExists(
		docsDir,
		"VIEWER_DOCS_NOT_FOUND",
		() =>
			`Markdown directory not found at ${formatDisplayPath(docsDir, options.cwd)}. Create the directory or pass --docs to select a folder.`,
	);

	const env = {
		...process.env,
		MDF_DOCS_DIR: docsDir,
	};

	const spawnFn = options.spawnImpl ?? spawn;
	const args = buildViewerArgs(options);

	const child = spawnFn("npm", args, {
		cwd: siteDir,
		env,
		stdio: "inherit",
	});

	await new Promise<void>((resolve, reject) => {
		child.on("error", (error) => {
			reject(
				new MdfError(
					"VIEWER_START_FAILED",
					`Failed to launch the viewer: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		});

		child.on("exit", (code, signal) => {
			if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
				resolve();
				return;
			}

			reject(
				new MdfError(
					"VIEWER_START_FAILED",
					`Viewer process exited with code ${code ?? "unknown"}`,
				),
			);
		});
	});
}

function buildViewerArgs(options: ViewerCommandOptions): string[] {
	const args: string[] = ["run", "dev", "--"];
	if (options.host) {
		args.push("--host", options.host);
	}
	if (options.port !== undefined) {
		args.push("--port", String(options.port));
	}
	if (options.open) {
		args.push("--open");
	}
	return args;
}

async function ensureDirectoryExists(
	directory: string,
	errorCode: MdfError["code"],
	formatMessage: () => string,
): Promise<void> {
	try {
		await access(directory, fsConstants.F_OK);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new MdfError(errorCode, formatMessage());
		}
		throw error;
	}
}

function formatDisplayPath(filePath: string, cwd: string): string {
	const relative = path.relative(cwd, filePath) || path.basename(filePath);
	if (relative.startsWith("..")) {
		return relative;
	}
	return relative.startsWith(".") ? relative : `./${relative}`;
}
