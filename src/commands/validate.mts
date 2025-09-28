import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { loadConfig } from "../config.mts";
import { MdfError } from "../errors.mts";
import {
	readMarkdownDocument,
	serializeMarkdownDocument,
} from "../front-matter.mts";
import { parseFrontMatterInputs } from "../front-matter-inputs.mts";
import type { LoadedConfig } from "../types.mts";

export interface ValidateCommandOptions {
	cwd: string;
	directory: string;
}

export interface ValidateCommandResult {
	invalid: ValidationIssue[];
	checkedFiles: string[];
}

export interface ValidationIssue {
	filePath: string;
	messages: string[];
}

export interface FixCommandOptions {
	cwd: string;
	directory: string;
	frontMatterInputs: string[];
}

export interface FixCommandResult {
	updated: string[];
	skipped: ValidationIssue[];
}

export async function runValidateCommand(
	options: ValidateCommandOptions,
): Promise<ValidateCommandResult> {
	const { config, files } = await prepareFiles(options);

	const invalid: ValidationIssue[] = [];
	for (const file of files) {
		const relative = path.relative(options.cwd, file);
		const schemaEntry = config.getSchemaForRelativePath(relative);
		const validation = await validateFile(schemaEntry.schema, file);
		if (!validation.success) {
			invalid.push({ filePath: file, messages: validation.messages });
		}
	}

	return { invalid, checkedFiles: files };
}

export async function runFixCommand(
	options: FixCommandOptions,
): Promise<FixCommandResult> {
	const defaults = parseFrontMatterInputs(options.frontMatterInputs);
	const { config, files } = await prepareFiles(options);

	const updated: string[] = [];
	const skipped: ValidationIssue[] = [];

	for (const file of files) {
		const relative = path.relative(options.cwd, file);
		const schemaEntry = config.getSchemaForRelativePath(relative);
		const validation = await validateFile(schemaEntry.schema, file);
		if (validation.success) {
			continue;
		}

		try {
			const document = await readMarkdownDocument(file);
			const patched = applyDefaults(document.frontMatter, defaults);
			const parsed = await schemaEntry.schema.safeParseAsync(patched);
			if (!parsed.success) {
				const messages = parsed.error.issues.map(formatZodIssue);
				skipped.push({ filePath: file, messages });
				continue;
			}

			const serialized = serializeMarkdownDocument(
				parsed.data as Record<string, unknown>,
				document.body,
			);
			await fs.writeFile(file, serialized, "utf8");
			updated.push(file);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			skipped.push({ filePath: file, messages: [message] });
		}
	}

	return { updated, skipped };
}

async function prepareFiles(
	options: ValidateCommandOptions,
): Promise<{ config: LoadedConfig; files: string[] }> {
	const resolvedDirectory = path.resolve(options.cwd, options.directory);
	const config = await loadConfig(options.cwd);
	if (!config) {
		throw new MdfError(
			"CONFIG_NOT_FOUND",
			"Could not find an mdf config file. Create one at .config/mdf.mts",
		);
	}

	const extension = normalizeExtension(config.extension ?? ".md");
	const files = await collectFiles(resolvedDirectory, extension);
	if (!files.length) {
		throw new MdfError(
			"NO_MATCHING_FILES",
			`No files with extension ${extension} found in ${resolvedDirectory}`,
		);
	}

	return { config, files };
}

async function collectFiles(
	directory: string,
	extension: string,
): Promise<string[]> {
	const results: string[] = [];
	async function walk(current: string): Promise<void> {
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(entryPath);
			} else if (entry.isFile() && entry.name.endsWith(extension)) {
				results.push(entryPath);
			}
		}
	}

	await walk(directory);
	return results.sort();
}

async function validateFile(
	schema: z.ZodTypeAny,
	filePath: string,
): Promise<{ success: true } | { success: false; messages: string[] }> {
	try {
		const document = await readMarkdownDocument(filePath);
		const parsed = await schema.safeParseAsync(document.frontMatter);
		if (parsed.success) {
			const missing = findMissingFields(parsed.data, document.frontMatter);
			if (missing.length > 0) {
				const messages = missing.map((field) =>
					field ? `${field} field is missing` : "A required field is missing",
				);
				return { success: false, messages };
			}
			return { success: true };
		}
		const messages = parsed.error.issues.map(formatZodIssue);
		return { success: false, messages };
	} catch (error) {
		if (error instanceof MdfError) {
			return { success: false, messages: [error.message] };
		}
		return {
			success: false,
			messages: [error instanceof Error ? error.message : String(error)],
		};
	}
}

function formatZodIssue(issue: z.ZodIssue): string {
	const path = issue.path.join(".");
	const lowerMessage = issue.message.toLowerCase();
	const received =
		issue.code === "invalid_type" &&
		"received" in issue &&
		typeof (issue as { received?: unknown }).received === "string"
			? (issue as { received: string }).received
			: undefined;
	if (
		(issue.code === "invalid_type" &&
			(received === "undefined" ||
				lowerMessage.includes("received undefined"))) ||
		lowerMessage === "required"
	) {
		return path ? `${path} field is missing` : "A required field is missing";
	}
	return path ? `${path}: ${issue.message}` : issue.message;
}

function findMissingFields(
	parsed: unknown,
	original: Record<string, unknown>,
): string[] {
	return collectMissingFields(parsed, original, []);
}

function collectMissingFields(
	parsed: unknown,
	original: unknown,
	path: string[],
): string[] {
	if (isPlainObject(parsed)) {
		const source = isPlainObject(original) ? original : undefined;
		const missing: string[] = [];
		for (const key of Object.keys(parsed)) {
			if (!source || !Object.hasOwn(source, key)) {
				missing.push(joinPath(path, key));
				continue;
			}
			missing.push(
				...collectMissingFields(
					(parsed as Record<string, unknown>)[key],
					(source as Record<string, unknown>)[key],
					[...path, key],
				),
			);
		}
		return missing;
	}

	if (Array.isArray(parsed)) {
		if (!Array.isArray(original)) {
			return [joinPath(path)];
		}
		return [];
	}

	if (original === undefined) {
		return [joinPath(path)];
	}

	return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function joinPath(path: string[], leaf?: string): string {
	const segments = leaf === undefined ? path : [...path, leaf];
	return segments.filter(Boolean).join(".");
}

function applyDefaults(
	frontMatter: Record<string, unknown>,
	defaults: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...frontMatter };
	for (const [key, value] of Object.entries(defaults)) {
		if (result[key] === undefined) {
			result[key] = value;
		}
	}
	return result;
}

function normalizeExtension(extension: string): string {
	return extension.startsWith(".") ? extension : `.${extension}`;
}
