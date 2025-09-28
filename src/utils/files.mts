import { promises as fs } from "node:fs";
import path from "node:path";

export async function collectMarkdownFiles(
	directory: string,
	extension: string,
): Promise<string[]> {
	const results: string[] = [];

	async function walk(current: string): Promise<void> {
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			if (entry.isFile() && fullPath.endsWith(extension)) {
				results.push(fullPath);
			}
		}
	}

	await walk(directory);
	return results.sort();
}

export function normalizeExtension(extension: string): string {
	return extension.startsWith(".") ? extension : `.${extension}`;
}
