#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

const argv = process.argv.slice(2);
let distTag = "";
let dryRun = false;

for (let i = 0; i < argv.length; i += 1) {
	const arg = argv[i];
	if (arg === "--tag" || arg === "-t") {
		const value = argv[i + 1];
		if (!value) {
			console.error("Missing value for --tag");
			process.exitCode = 1;
			process.exit(1);
		}
		distTag = value;
		i += 1;
	} else if (arg === "--dry-run") {
		dryRun = true;
	} else if (arg === "--help" || arg === "-h") {
		console.log(
			`Usage: node scripts/publish.mjs [--tag <dist-tag>] [--dry-run]\n\n` +
				`Runs tests and publishes the current package version to npm.\n\n` +
				`Options:\n` +
				`  --tag, -t <dist-tag>  Publish with the provided npm dist-tag\n` +
				`  --dry-run             Pass the --dry-run flag to npm publish\n`,
		);
		process.exit(0);
	} else {
		console.error(`Unknown argument: ${arg}`);
		process.exitCode = 1;
		process.exit(1);
	}
}

const packageJsonPath = path.join(repoRoot, "package.json");

const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));

const run = async (cmd, args, options = {}) => {
	await execa(cmd, args, {
		stdio: "inherit",
		cwd: repoRoot,
		...options,
	});
};

console.log(`\nPreparing to publish ${pkg.name} v${pkg.version}\n`);

await run("npm", ["run", "test"]);

const publishArgs = ["publish", "--access", "public"];
if (distTag) {
	publishArgs.push("--tag", distTag);
}

if (dryRun) {
	publishArgs.push("--dry-run");
}

console.log(
	`\nPublishing to npm${distTag ? ` with dist-tag "${distTag}"` : ""}${dryRun ? " (dry run)" : ""}...\n`,
);

await run("npm", publishArgs);

console.log("\nPublish completed.");
