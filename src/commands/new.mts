import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { loadConfig } from "../config.mts";
import { MarkdfmError } from "../errors.mts";
import { parseFrontMatterInputs } from "../front-matter-inputs.mts";
import type { LoadedConfig } from "../types.mts";

export interface NewCommandOptions {
	cwd: string;
	directory: string;
	frontMatterInputs: string[];
	now?: Date;
}

export interface NewCommandResult {
	filePath: string;
	frontMatter: unknown;
}

export async function runNewCommand(
	options: NewCommandOptions,
): Promise<NewCommandResult> {
	const now = options.now ?? new Date();
	const resolvedDirectory = path.resolve(options.cwd, options.directory);
	const config = await loadConfig(options.cwd);

	if (!config) {
		throw new MarkdfmError(
			"CONFIG_NOT_FOUND",
			"Could not find a markdfm config file. Create one at .config/markdfm.mts",
		);
	}

	const baseData = await buildInitialFrontMatter(
		config,
		options.frontMatterInputs,
		now,
	);
	const parsed = await parseFrontMatter(config, baseData);

	const filePath = await writeMarkdownFile({
		config,
		data: parsed,
		directory: resolvedDirectory,
		now,
	});
	return { filePath, frontMatter: parsed };
}

async function writeMarkdownFile(params: {
	config: LoadedConfig;
	data: Record<string, unknown>;
	directory: string;
	now: Date;
}): Promise<string> {
	const { config, data, directory, now } = params;

	await fs.mkdir(directory, { recursive: true });

	const extension = normalizeExtension(config.extension ?? ".md");
	const fileName = await determineFileName({
		config,
		data,
		directory,
		extension,
		now,
	});
	const fullPath = path.join(directory, fileName);

	await ensureUniquePath(fullPath);

	const frontMatterBlock = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
	const content = await resolveContent(config, data, now);

	const frontMatterSection = `---\n${frontMatterBlock}\n---\n\n`;
	const bodySection = content ? ensureTrailingNewline(content) : "";
	const finalContent = frontMatterSection + bodySection;

	await fs.writeFile(fullPath, finalContent, "utf8");
	return fullPath;
}

function ensureTrailingNewline(input: string): string {
	const normalized = input.endsWith("\n") ? input : `${input}\n`;
	return normalized;
}

async function determineFileName(params: {
	config: LoadedConfig;
	data: Record<string, unknown>;
	directory: string;
	extension: string;
	now: Date;
}): Promise<string> {
	const { config, data, directory, extension, now } = params;

	if (config.fileName) {
		const provided = await config.fileName({ data, directory, now });
		if (!provided || typeof provided !== "string") {
			throw new MarkdfmError(
				"INVALID_FILE_NAME",
				"Config fileName() must return a non-empty string",
			);
		}
		return appendExtensionIfMissing(provided, extension);
	}

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const candidate = `${generateUuidV7(now)}${extension}`;
		const candidatePath = path.join(directory, candidate);
		const exists = await pathExists(candidatePath);
		if (!exists) {
			return candidate;
		}
	}

	throw new MarkdfmError(
		"FILE_EXISTS",
		"Unable to generate a unique file name after multiple attempts",
	);
}

async function ensureUniquePath(filePath: string): Promise<void> {
	try {
		await fs.access(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}

	throw new MarkdfmError("FILE_EXISTS", `File already exists at ${filePath}`);
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function resolveContent(
	config: LoadedConfig,
	data: unknown,
	now: Date,
): Promise<string> {
	if (!config.content) {
		return "";
	}

	if (typeof config.content === "string") {
		return config.content;
	}

	const result = await config.content({ data, now });
	if (typeof result !== "string") {
		throw new MarkdfmError(
			"INVALID_CONTENT",
			"Config content() must return a string",
		);
	}
	return result;
}

async function buildInitialFrontMatter(
	config: LoadedConfig,
	inputs: string[],
	now: Date,
): Promise<Record<string, unknown>> {
	const defaults = await resolveDefaults(config, now);
        const cliValues = parseFrontMatterInputs(inputs);
        const combined = { ...defaults, ...cliValues };
        ensureRequiredStringFields(config, combined);
        return combined;
}

async function resolveDefaults(
	config: LoadedConfig,
	now: Date,
): Promise<Record<string, unknown>> {
	if (!config.defaults) {
		return {};
	}

	if (typeof config.defaults === "function") {
		const result = await config.defaults({ now });
		return result ? { ...result } : {};
	}

	return { ...config.defaults };
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
	let current: z.ZodTypeAny = schema;

	while (true) {
		const def = (current as unknown as { _def?: Record<string, unknown> })._def;
		if (!def || typeof def !== "object") {
			return current;
		}
		const typeName = String((def as { typeName?: unknown }).typeName ?? "");
		if (
			typeName === "ZodOptional" ||
			typeName === "ZodNullable" ||
			typeName === "ZodDefault" ||
			typeName === "ZodCatch"
		) {
			current = (def as { innerType: z.ZodTypeAny }).innerType;
			continue;
		}
		if (typeName === "ZodEffects") {
			current = (def as { schema: z.ZodTypeAny }).schema;
			continue;
		}
		return current;
	}
}

function ensureRequiredStringFields(
	config: LoadedConfig,
	frontMatter: Record<string, unknown>,
): void {
	const baseSchema = unwrapSchema(config.schema);
	if (!(baseSchema instanceof z.ZodObject)) {
		return;
	}

	const shape = baseSchema.shape as Record<string, z.ZodTypeAny | undefined>;
	for (const [key, fieldSchema] of Object.entries(shape)) {
		if (!fieldSchema || frontMatter[key] !== undefined) {
			continue;
		}
		if (!isRequiredField(fieldSchema)) {
			continue;
		}

		const inner = unwrapSchema(fieldSchema);
		if (inner instanceof z.ZodString) {
			frontMatter[key] = "";
		}
	}
}

function isRequiredField(schema: z.ZodTypeAny): boolean {
	let current: z.ZodTypeAny | undefined = schema;
	while (current) {
		const def:
			| {
					typeName?: string;
					innerType?: z.ZodTypeAny;
					schema?: z.ZodTypeAny;
			  }
			| undefined = (
			current as unknown as {
				_def?: {
					typeName?: string;
					innerType?: z.ZodTypeAny;
					schema?: z.ZodTypeAny;
				};
			}
		)._def;
		const typeName: string | undefined = def?.typeName;
		if (!typeName) {
			return true;
		}
		switch (typeName) {
			case "ZodOptional":
			case "ZodDefault":
			case "ZodCatch":
				return false;
			case "ZodNullable":
				current = def?.innerType;
				continue;
			case "ZodEffects":
				current = def?.schema;
				continue;
			default:
				return true;
		}
	}
	return true;
}

function generateUuidV7(now: Date): string {
	// Mask the timestamp to 48 bits for simplicity
	// It works until year 10889
	const ts48 = BigInt(now.getTime()) & ((1n << 48n) - 1n);

	const buffer = new Uint8Array(16);
	buffer[0] = Number((ts48 >> 40n) & 0xffn);
	buffer[1] = Number((ts48 >> 32n) & 0xffn);
	buffer[2] = Number((ts48 >> 24n) & 0xffn);
	buffer[3] = Number((ts48 >> 16n) & 0xffn);
	buffer[4] = Number((ts48 >> 8n) & 0xffn);
	buffer[5] = Number(ts48 & 0xffn);

	const random = randomBytes(10);
	buffer.set(random, 6);

	buffer[6] = (buffer[6] & 0x0f) | 0x70;
	buffer[8] = (buffer[8] & 0x3f) | 0x80;

	let hex = "";
	for (const byte of buffer) {
		hex += byte.toString(16).padStart(2, "0");
	}

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function parseFrontMatter(
        config: LoadedConfig,
        candidate: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	try {
		const result = await config.schema.parseAsync(candidate);
		return result as Record<string, unknown>;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new MarkdfmError("SCHEMA_VALIDATION", error.message);
		}
		throw error;
	}
}

function normalizeExtension(extension: string): string {
	if (!extension.startsWith(".")) {
		return `.${extension}`;
	}
	return extension;
}

function appendExtensionIfMissing(fileName: string, extension: string): string {
        if (fileName.endsWith(extension)) {
                return fileName;
        }
        return `${fileName}${extension}`;
}
