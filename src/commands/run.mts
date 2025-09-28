import path from "node:path";
import { loadConfig } from "../config.mts";
import { MdfError } from "../errors.mts";

export interface RunCommandOptions {
	cwd: string;
	alias: string;
	extraArgs?: readonly string[];
}

export interface RunCommandResult {
	argv: string[];
}

export async function prepareRunCommand(
	options: RunCommandOptions,
): Promise<RunCommandResult> {
	const config = await loadConfig(options.cwd);
	if (!config) {
		throw new MdfError(
			"CONFIG_NOT_FOUND",
			"Could not find an mdf config file. Create one at .config/mdf.mts",
		);
	}

	const aliasName = options.alias.trim();
	if (!aliasName) {
		throw new MdfError(
			"INVALID_ALIAS_COMMAND",
			"Alias name must be provided to run a command",
		);
	}

	const aliasCommand = config.aliases?.[aliasName];
	if (!aliasCommand) {
		const displayPath = formatDisplayPath(config.path, options.cwd);
		throw new MdfError(
			"ALIAS_NOT_FOUND",
			`Alias "${aliasName}" not found in ${displayPath}. Define it under aliases in the config file.`,
		);
	}

	const argv = parseAliasCommand(aliasCommand);
	if (argv.length === 0) {
		throw new MdfError(
			"INVALID_ALIAS_COMMAND",
			`Alias "${aliasName}" does not define a command to execute`,
		);
	}

	if (argv[0] === "mdf") {
		argv.shift();
	}

	const extras = options.extraArgs ?? [];
	if (extras.length > 0) {
		argv.push(...extras);
	}

	return { argv };
}

function parseAliasCommand(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let isEscaping = false;

	for (const char of command) {
		if (isEscaping) {
			current += char;
			isEscaping = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			isEscaping = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}

		if (/\s/u.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		current += char;
	}

	if (quote) {
		throw new MdfError(
			"INVALID_ALIAS_COMMAND",
			`Alias command has an unterminated ${quote === '"' ? "double" : "single"} quote`,
		);
	}

	if (isEscaping) {
		current += "\\";
	}

	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

function formatDisplayPath(filePath: string, cwd: string): string {
	const relative = path.relative(cwd, filePath) || path.basename(filePath);
	if (relative.startsWith("..")) {
		return relative;
	}
	return relative.startsWith(".") ? relative : `./${relative}`;
}
