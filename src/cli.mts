#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { runListCommand } from "./commands/list.mts";
import { runNewCommand } from "./commands/new.mts";
import { prepareRunCommand } from "./commands/run.mts";
import { runUpdateCommand } from "./commands/update.mts";
import { runFixCommand, runValidateCommand } from "./commands/validate.mts";
import { runViewerCommand } from "./commands/viewer.mts";
import { MdfError } from "./errors.mts";
import { logInvalidFileWarnings } from "./utils/invalid-file-warning.mts";

async function bootstrap(): Promise<void> {
	const version = await readPackageVersion().catch(() => "0.0.0");
	const program = createProgram(version);

	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		handleError(error);
	}
}

function createProgram(version: string): Command {
	const program = new Command();

	program
		.name("mdf")
		.description(
			"Lightweight utility to organize Markdown files with front matter",
		)
		.version(version)
		.showHelpAfterError()
		.enablePositionalOptions();

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
		.option("--template <name>", "Template name defined in the config file")
		.argument("<directory>", "Target directory for the Markdown file")
		.action(
			async (
				directory: string,
				command: { fm?: string[]; template?: string },
			) => {
				try {
					const fmInputs = command.fm ?? [];
					const result = await runNewCommand({
						cwd: process.cwd(),
						directory,
						frontMatterInputs: fmInputs,
						template: command.template,
					});

					const relative =
						path.relative(process.cwd(), result.filePath) ||
						path.basename(result.filePath);
					console.log(`Created ${relative}`);
				} catch (error) {
					handleError(error);
				}
			},
		);

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
						count === 1 ? "1 file is valid" : `${count} files are valid`;
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
		.command("list")
		.description("List Markdown files using virtual paths")
		.option("--vpath <prefix>", "Filter entries by virtual path prefix")
		.option(
			"-f, --filter <expression>",
			"Filter expression supporting =, ~=, ^=, $= operators",
			collectFilters,
			[] as string[],
		)
		.option(
			"--format <template>",
			"Output template using {{field}} placeholders",
		)
		.option("-q, --quiet", "Print only document IDs")
		.option("--strict", "Treat invalid Markdown files as errors")
		.argument("<directory>", "Directory containing Markdown files to list")
		.action(
			async (
				directory: string,
				command: {
					vpath?: string;
					filter?: string[];
					format?: string;
					strict?: boolean;
					quiet?: boolean;
				},
			) => {
				try {
					const filters = command.filter ?? [];
					const result = await runListCommand({
						cwd: process.cwd(),
						directory,
						virtualPathPrefix: command.vpath,
						filters,
						format: command.format,
						strict: command.strict === true,
						quiet: command.quiet === true,
					});

					for (const line of result.lines) {
						console.log(line);
					}

					if (result.warnings.length > 0) {
						logInvalidFileWarnings(result.warnings, process.cwd());
					}
				} catch (error) {
					handleError(error);
				}
			},
		);

	program
		.command("fix")
		.description("Update Markdown files to satisfy the configured schema")
		.option(
			"-f, --fm <key=value>",
			"Default front matter value used to fill missing fields",
			collectFrontMatter,
			[] as string[],
		)
		.argument("<directory>", "Directory containing Markdown files to update")
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

	program
		.command("viewer")
		.description("Start an interactive web viewer for Markdown files")
		.option("--vpath <prefix>", "Filter entries by virtual path prefix")
		.option(
			"-f, --filter <expression>",
			"Filter expression supporting =, ~=, ^=, $= operators",
			collectFilters,
			[] as string[],
		)
		.option(
			"--port <number>",
			"Port to bind the viewer server (defaults to 4173)",
		)
		.option("--host <hostname>", "Hostname to bind the viewer server")
		.option("--strict", "Treat invalid Markdown files as errors")
		.argument("<directory>", "Directory containing Markdown files to render")
		.action(
			async (
				directory: string,
				command: {
					vpath?: string;
					filter?: string[];
					port?: string;
					host?: string;
					strict?: boolean;
				},
			) => {
				try {
					const filters = command.filter ?? [];
					const port =
						command.port === undefined ? undefined : parsePort(command.port);
					await runViewerCommand({
						cwd: process.cwd(),
						directory,
						filters,
						virtualPathPrefix: command.vpath,
						port,
						host: command.host,
						strict: command.strict === true,
					});
				} catch (error) {
					handleError(error);
				}
			},
		);

	program
		.command("update")
		.description("Update front matter fields on specific Markdown files")
		.option(
			"-f, --fm <entry>",
			"Front matter update; omit =value to use defaults",
			collectFrontMatter,
			[] as string[],
		)
		.option("--strict", "Treat invalid Markdown files as errors")
		.argument("<files...>", "Markdown files to update")
		.action(
			async (files: string[], command: { fm?: string[]; strict?: boolean }) => {
				try {
					const fmInputs = command.fm ?? [];
					const result = await runUpdateCommand({
						cwd: process.cwd(),
						files,
						frontMatterInputs: fmInputs,
						strict: command.strict === true,
					});

					for (const filePath of result.updated) {
						console.log(`Updated ${formatDisplayPath(filePath)}`);
					}

					if (result.warnings.length > 0) {
						logInvalidFileWarnings(result.warnings, process.cwd());
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
			},
		);

	program
		.command("run")
		.description("Execute a configured alias command")
		.argument("<alias>", "Alias name defined in the config file")
		.argument("[args...]", "Additional arguments appended to the alias")
		.allowUnknownOption()
		.passThroughOptions()
		.action(async (aliasName: string, args: string[] = []) => {
			const extras = Array.isArray(args) ? args : [];
			const previousStack = process.env.MDF_ALIAS_STACK;
			const delimiter = "\u001F";
			const visited = previousStack
				? previousStack
						.split(delimiter)
						.map((entry) => entry.trim())
						.filter((entry) => entry.length > 0)
				: [];

			if (visited.includes(aliasName)) {
				handleError(
					new MdfError(
						"ALIAS_CYCLE",
						`Detected a cycle while resolving alias "${aliasName}"`,
					),
				);
				return;
			}

			process.env.MDF_ALIAS_STACK = [...visited, aliasName].join(delimiter);

			try {
				const result = await prepareRunCommand({
					cwd: process.cwd(),
					alias: aliasName,
					extraArgs: extras,
				});

				const aliasProgram = createProgram(version);
				await aliasProgram.parseAsync([
					process.argv[0] ?? "node",
					process.argv[1] ?? "mdf",
					...result.argv,
				]);
			} catch (error) {
				handleError(error);
			} finally {
				if (previousStack === undefined) {
					delete process.env.MDF_ALIAS_STACK;
				} else {
					process.env.MDF_ALIAS_STACK = previousStack;
				}
			}
		});

	return program;
}

function collectFrontMatter(value: string, previous: string[]): string[] {
	return [...previous, value];
}

function collectFilters(value: string, previous: string[]): string[] {
	return [...previous, value];
}

function parsePort(raw: string): number {
	const value = Number.parseInt(raw, 10);
	if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
		throw new MdfError(
			"INVALID_VIEWER_PORT",
			`Viewer port must be an integer between 1 and 65535. Received "${raw}"`,
		);
	}
	return value;
}

function formatDisplayPath(filePath: string): string {
	const relative =
		path.relative(process.cwd(), filePath) || path.basename(filePath);
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
	if (error instanceof MdfError) {
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
