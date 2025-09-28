import { promises as fs } from "node:fs";
import path from "node:path";

const DIST_CLI = path.resolve("dist", "cli.mjs");
const SHEBANG = "#!/usr/bin/env node\n";

async function main() {
	try {
		const original = await fs.readFile(DIST_CLI, "utf8");
		if (original.startsWith(SHEBANG)) {
			return;
		}
		await fs.writeFile(DIST_CLI, SHEBANG + original, "utf8");
	} catch (error) {
		if (
			(error instanceof Error && "code" in error && error.code === "ENOENT") ||
			(error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT")
		) {
			console.warn(`warn: ${DIST_CLI} missing; skipped shebang injection`);
			return;
		}
		throw error;
	}
}

await main();
