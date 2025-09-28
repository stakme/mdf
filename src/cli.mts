#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { runNewCommand } from "./commands/new.mts";
import { runFixCommand, runValidateCommand } from "./commands/validate.mts";
import { MarkdfmError } from "./errors.mts";

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

        program
                .command("validate")
                .description(
                        "Validate existing Markdown files against the configured schema",
                )
                .argument("<directory>", "Directory containing Markdown files to validate")
                .action(async (directory: string) => {
                        try {
                                const result = await runValidateCommand({
                                        cwd: process.cwd(),
                                        directory,
                                });

                                if (result.invalid.length === 0) {
                                        const files = result.checkedFiles.map(formatDisplayPath);
                                        const count = files.length;
                                        const summary =
                                                count === 1
                                                        ? "1 file is valid"
                                                        : `${count} files are valid`;
                                        console.log(summary);
                                        for (const file of files) {
                                                console.log(`- ${file}`);
                                        }
                                        return;
                                }

                                for (const entry of result.invalid) {
                                        const displayPath = formatDisplayPath(entry.filePath);
                                        for (const message of entry.messages) {
                                                console.error(`${displayPath}: ${message}`);
                                        }
                                }
                                process.exitCode = 1;
                        } catch (error) {
                                handleError(error);
                        }
                });

        program
                .command("fix")
                .description(
                        "Update Markdown files to satisfy the configured schema",
                )
                .option(
                        "-f, --fm <key=value>",
                        "Default front matter value used to fill missing fields",
                        collectFrontMatter,
                        [] as string[],
                )
                .argument(
                        "<directory>",
                        "Directory containing Markdown files to update",
                )
                .action(async (directory: string, command: { fm?: string[] }) => {
                        try {
                                const defaults = command.fm ?? [];
                                const result = await runFixCommand({
                                        cwd: process.cwd(),
                                        directory,
                                        frontMatterInputs: defaults,
                                });

                                for (const filePath of result.updated) {
                                        console.log(`Updated ${formatDisplayPath(filePath)}`);
                                }

                                if (result.skipped.length > 0) {
                                        for (const entry of result.skipped) {
                                                const displayPath = formatDisplayPath(entry.filePath);
                                                for (const message of entry.messages) {
                                                        console.error(`${displayPath}: ${message}`);
                                                }
                                        }
                                        process.exitCode = 1;
                                }
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

function formatDisplayPath(filePath: string): string {
        const relative = path.relative(process.cwd(), filePath) || path.basename(filePath);
        if (relative.startsWith("..")) {
                return relative;
        }
        return relative.startsWith(".") ? relative : `./${relative}`;
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
