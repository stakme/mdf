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

export const DEFAULT_CONFIG_SOURCE = `
import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
	aliases: {
		todo: \`list --filter "status=todo" ./\`,
		new_bug: \`new ./ticket --template bug_report\`,
		close: \`update --fm "status=done" --fm updated_at\`,
	},

	schema: {
		default: defineSchema({
			glob: "**/*.md",
			schema: z.object({
				title: z.string(),
				vpath: z.string().optional(),
				status: z.enum(["todo", "in_progress", "done"]).default("todo"),
				tags: z.array(z.string()).optional(),
				created_at: z.iso.datetime().default(() => new Date().toISOString()),
				updated_at: z.iso.datetime().default(() => new Date().toISOString()),
			}),
			sort: (a, b) => a.created_at.localeCompare(b.created_at),
		})
	},
	defaultSchema: "default",

	templates: {
		bug_report: {
			schema: "default",
			frontmatter: {
				title: "[Bug] Brief summary",
				vpath: "bug_reports",
				status: "todo",
				tags: ["bug"],
			},
			body: ({ title }) => \`# \${title}

## Summary
Provide a concise description of the issue.

## Steps to Reproduce

1. 
2. 
3. 

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Environment
- OS:
- Node.js:
- App/Package Version:

## Additional Context
Logs, screenshots, or notes.
\`,
	},
}
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
