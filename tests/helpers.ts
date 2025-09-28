import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(currentDir, "..");
export const cliPath = path.join(projectRoot, "dist", "cli.mjs");
export const nodeBinary =
	process.execPath ?? "/Users/stakme/.nvm/versions/node/v24.9.0/bin/node";

export async function setupWorkspace(options?: {
	localConfig?: string;
	config?: string;
}): Promise<string> {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markdfm-test-"));
	const configDir = path.join(tempDir, ".config");
	await fs.mkdir(configDir, { recursive: true });

	const configFile = path.join(configDir, "markdfm.mts");
	const configSource =
		options?.config ??
		`import { defineConfig, z } from "markdfm/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                description: z.string(),
                author: z.string(),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
                tags: z.array(z.string()).default(() => []),
        }),
        templates: {
                default: {
                        frontmatter: {
                                title: "[New Note] Title goes here",
                                description: "Describe your note here",
                        },
                        body: ({ title, description }) =>
                                "# " +
                                title +
                                "\\n\\n" +
                                description +
                                "\\n\\n## What I need\\n\\n## So I will create...",
                },
        },
});`;
	await fs.writeFile(configFile, configSource, "utf8");

	if (options?.localConfig) {
		const localConfigFile = path.join(configDir, "markdfm.local.mts");
		await fs.writeFile(localConfigFile, options.localConfig, "utf8");
	}

	return tempDir;
}

export function parseFrontMatter<T extends Record<string, unknown>>(
	content: string,
): {
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
