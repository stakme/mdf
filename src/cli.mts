#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { MarkdfmError, runNewCommand } from "./commands/new.mts";

async function bootstrap(): Promise<void> {
	const program = new Command();
	const version = await readPackageVersion().catch(() => "0.0.0");

	program
		.name("markdfm")
		.description(
			"Lightweight utility to organize Markdown files with front matter",
		)
		.version(version)
		.showHelpAfterError();

	program
		.command("new")
		.description(
			"Create a new Markdown file populated with validated front matter",
		)
		.option(
			"-f, --fm <key=value>",
			"Front matter entry",
			collectFrontMatter,
			[] as string[],
		)
		.argument("<directory>", "Target directory for the Markdown file")
		.action(async (directory: string, command: { fm?: string[] }) => {
			try {
				const fmInputs = command.fm ?? [];
				const result = await runNewCommand({
					cwd: process.cwd(),
					directory,
					frontMatterInputs: fmInputs,
				});

				const relative =
					path.relative(process.cwd(), result.filePath) ||
					path.basename(result.filePath);
				console.log(`Created ${relative}`);
			} catch (error) {
				handleError(error);
			}
		});

	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		handleError(error);
	}
}

function collectFrontMatter(value: string, previous: string[]): string[] {
	return [...previous, value];
}

async function readPackageVersion(): Promise<string> {
	const packageJsonPath = new URL("../package.json", import.meta.url);
	const raw = await readFile(packageJsonPath, "utf8");
	const pkg = JSON.parse(raw) as { version?: string };
	return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function handleError(error: unknown): never {
	if (error instanceof MarkdfmError) {
		console.error(error.message);
		process.exit(1);
	}

	if (error instanceof Error) {
		console.error(error.message);
		process.exit(1);
	}

	console.error(String(error));
	process.exit(1);
}

bootstrap();
