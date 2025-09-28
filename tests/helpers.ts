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

export async function setupWorkspace(): Promise<string> {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markdfm-test-"));
        const configDir = path.join(tempDir, ".config");
        await fs.mkdir(configDir, { recursive: true });

        const configFile = path.join(configDir, "markdfm.mts");
        const configSource = `import { defineConfig, z } from "markdfm/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                description: z.string(),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
                tags: z.array(z.string()).default(() => []),
        }),
});`;
        await fs.writeFile(configFile, configSource, "utf8");

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
