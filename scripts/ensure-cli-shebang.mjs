import { promises as fs } from "node:fs";
import path from "node:path";

const DIST_CLI = path.resolve("dist", "cli.mjs");
const DIST_CONFIG_DTS = path.resolve("dist", "config.d.mts");
const SHEBANG = "#!/usr/bin/env node\n";
const INDEX_IMPORT_TARGET = "./index.mjs";
const INDEX_TYPES_TARGET = "./index.d.mts";

async function main() {
	await Promise.all([ensureCliShebang(), rewriteConfigDtsImport()]);
}

async function ensureCliShebang() {
	try {
		const original = await fs.readFile(DIST_CLI, "utf8");
		if (original.startsWith(SHEBANG)) {
			return;
		}
		await fs.writeFile(DIST_CLI, SHEBANG + original, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) {
			console.warn(`warn: ${DIST_CLI} missing; skipped shebang injection`);
			return;
		}
		throw error;
	}
}

async function rewriteConfigDtsImport() {
	try {
		const original = await fs.readFile(DIST_CONFIG_DTS, "utf8");
		if (!original.includes(INDEX_IMPORT_TARGET)) {
			return;
		}
		const updated = original.replaceAll(INDEX_IMPORT_TARGET, INDEX_TYPES_TARGET);
		if (updated === original) {
			return;
		}
		await fs.writeFile(DIST_CONFIG_DTS, updated, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) {
			console.warn(`warn: ${DIST_CONFIG_DTS} missing; skipped config type rewrite`);
			return;
		}
		throw error;
	}
}

function isMissingFileError(error) {
	return (
		(error instanceof Error && "code" in error && error.code === "ENOENT") ||
		(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
	);
}

await main();
