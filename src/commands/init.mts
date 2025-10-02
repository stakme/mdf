import { promises as fs } from "node:fs";
import path from "node:path";
import { MdfError } from "../errors.mts";
import { formatDisplayPath } from "../utils/path-format.mts";

export interface InitCommandOptions {
	cwd: string;
	directory?: string;
}

export interface InitCommandResult {
	configPath: string;
}

export const DEFAULT_CONFIG_SOURCE = `import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
	schema: z.object({
		title: z.string(),
		status: z.enum(["todo", "in_progress", "done"]).default("todo"),
		tags: z.array(z.string()).default(() => []),
		created_at: z.string().datetime().default(() => new Date().toISOString()),
		updated_at: z.string().datetime().default(() => new Date().toISOString()),
	}),
});
`;

export async function runInitCommand(
	options: InitCommandOptions,
): Promise<InitCommandResult> {
	const directory = options.directory ?? ".";
	const targetDirectory = path.resolve(options.cwd, directory);
	const configDirectory = path.join(targetDirectory, ".config");
	const configPath = path.join(configDirectory, "mdf.mts");

	await fs.mkdir(configDirectory, { recursive: true });

	try {
		await fs.writeFile(configPath, DEFAULT_CONFIG_SOURCE, {
			encoding: "utf8",
			flag: "wx",
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			const displayPath = formatDisplayPath(configPath, options.cwd);
			throw new MdfError(
				"CONFIG_ALREADY_EXISTS",
				`Config file already exists at ${displayPath}`,
			);
		}
		throw error;
	}

	return { configPath };
}
