import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { loadConfig } from "../config.mts";
import { MdfError } from "../errors.mts";
import { parseFrontMatterInputs } from "../front-matter-inputs.mts";
import type {
	DefaultsValue,
	LoadedConfig,
	LoadedSchema,
	TemplateBodyContext,
	TemplateDefinition,
} from "../types.mts";

export interface NewCommandOptions {
	cwd: string;
	directory: string;
	frontMatterInputs: string[];
	now?: Date;
	template?: string;
	fileName?: string;
}

export interface NewCommandResult {
	filePath: string;
	frontMatter: unknown;
}

interface ResolvedTemplate {
	name: string;
	template: TemplateDefinition<Record<string, unknown>>;
}

export async function runNewCommand(
	options: NewCommandOptions,
): Promise<NewCommandResult> {
	const now = options.now ?? new Date();
	const resolvedDirectory = path.resolve(options.cwd, options.directory);
	const config = await loadConfig(options.cwd);

	if (!config) {
		throw new MdfError(
			"CONFIG_NOT_FOUND",
			"Could not find an mdf config file. Create one at .config/mdf.mts",
		);
	}

	const extension = normalizeExtension(config.extension ?? ".md");
	const relativeDirectory = path.relative(options.cwd, resolvedDirectory);
	const placeholderFile = path.join(relativeDirectory, `__mdf__${extension}`);

	const directorySchema = config.getSchemaForRelativePath(placeholderFile);
	const resolvedTemplate = await resolveTemplate(
		config,
		options.template,
		directorySchema.name,
	);
	const template = resolvedTemplate?.template;
	const schemaEntry = determineSchemaEntry(
		config,
		directorySchema,
		template,
		resolvedTemplate?.name,
		options.template,
	);
	const baseData = await buildInitialFrontMatter(
		config,
		schemaEntry.schema,
		options.frontMatterInputs,
		now,
		template,
	);
	const parsed = await parseFrontMatter(schemaEntry.schema, baseData);

	const filePath = await writeMarkdownFile({
		config,
		data: parsed,
		directory: resolvedDirectory,
		now,
		template,
		schema: schemaEntry,
		providedFileName: options.fileName,
	});
	return { filePath, frontMatter: parsed };
}

async function writeMarkdownFile(params: {
	config: LoadedConfig;
	data: Record<string, unknown>;
	directory: string;
	now: Date;
	schema: LoadedSchema;
	template?: TemplateDefinition<Record<string, unknown>>;
	providedFileName?: string;
}): Promise<string> {
	const { config, data, directory, now, schema, template, providedFileName } =
		params;

	await fs.mkdir(directory, { recursive: true });

	const extension = normalizeExtension(config.extension ?? ".md");
	const fileName = await determineFileName({
		config,
		data,
		directory,
		extension,
		now,
		schema,
		providedFileName,
	});
	const fullPath = path.join(directory, fileName);

	await ensureUniquePath(fullPath);

	await applySchemaVirtualFields({ config, data, schema });

	const frontMatterBlock = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
	const content = await resolveContent(config, template, data, now);

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
	schema: LoadedSchema;
	providedFileName?: string;
}): Promise<string> {
	const { config, data, directory, extension, now, schema, providedFileName } =
		params;

	if (providedFileName !== undefined) {
		if (typeof providedFileName !== "string") {
			throw new MdfError(
				"INVALID_FILE_NAME",
				"Provided file name must be a string",
			);
		}
		const trimmed = providedFileName.trim();
		if (!trimmed) {
			throw new MdfError(
				"INVALID_FILE_NAME",
				"Provided file name must be a non-empty string",
			);
		}
		return appendExtensionIfMissing(trimmed, extension);
	}

	if (schema.filename) {
		const generated = await schema.filename(data);
		if (typeof generated !== "string") {
			throw new MdfError(
				"INVALID_FILE_NAME",
				`Schema filename for "${schema.name}" must return a string`,
			);
		}
		const trimmed = generated.trim();
		if (!trimmed) {
			throw new MdfError(
				"INVALID_FILE_NAME",
				`Schema filename for "${schema.name}" must return a non-empty string`,
			);
		}
		return appendExtensionIfMissing(trimmed, extension);
	}

	if (config.fileName) {
		const provided = await config.fileName({ data, directory, now });
		if (!provided || typeof provided !== "string") {
			throw new MdfError(
				"INVALID_FILE_NAME",
				"Config fileName() must return a non-empty string",
			);
		}
		return appendExtensionIfMissing(provided, extension);
	}

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const candidate = `${generateId(now)}${extension}`;
		const candidatePath = path.join(directory, candidate);
		const exists = await pathExists(candidatePath);
		if (!exists) {
			return candidate;
		}
	}

	throw new MdfError(
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

	throw new MdfError("FILE_EXISTS", `File already exists at ${filePath}`);
}

async function applySchemaVirtualFields(params: {
	config: LoadedConfig;
	data: Record<string, unknown>;
	schema: LoadedSchema;
}): Promise<void> {
	const { config, data, schema } = params;

	const virtualPathField = config.virtualPath?.param;
	if (virtualPathField && schema.vpath) {
		const current = data[virtualPathField];
		if (
			current === undefined ||
			current === null ||
			(typeof current === "string" && !current.trim())
		) {
			const resolved = await schema.vpath(data);
			if (typeof resolved !== "string") {
				throw new MdfError(
					"INVALID_VIRTUAL_PATH_VALUE",
					`Schema vpath for "${schema.name}" must return a string`,
				);
			}
			const trimmed = resolved.trim();
			if (!trimmed) {
				throw new MdfError(
					"INVALID_VIRTUAL_PATH_VALUE",
					`Schema vpath for "${schema.name}" must return a non-empty string`,
				);
			}
			data[virtualPathField] = trimmed;
		}
	}

	const virtualSlugField = config.virtualSlug?.param;
	if (virtualSlugField && schema.vslug) {
		const current = data[virtualSlugField];
		if (
			current === undefined ||
			current === null ||
			(typeof current === "string" && !current.trim())
		) {
			const resolved = await schema.vslug(data);
			if (typeof resolved !== "string") {
				throw new MdfError(
					"INVALID_VIRTUAL_SLUG_VALUE",
					`Schema vslug for "${schema.name}" must return a string`,
				);
			}
			const trimmed = resolved.trim();
			if (!trimmed) {
				throw new MdfError(
					"INVALID_VIRTUAL_SLUG_VALUE",
					`Schema vslug for "${schema.name}" must return a non-empty string`,
				);
			}
			data[virtualSlugField] = trimmed;
		}
	}
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
	template: TemplateDefinition<Record<string, unknown>> | undefined,
	data: Record<string, unknown>,
	now: Date,
): Promise<string> {
	if (template?.body !== undefined) {
		return resolveTemplateBody(template.body, data, now);
	}

	if (!config.content) {
		return "";
	}

	if (typeof config.content === "string") {
		return config.content;
	}

	const result = await config.content({ data, now });
	if (typeof result !== "string") {
		throw new MdfError(
			"INVALID_CONTENT",
			"Config content() must return a string",
		);
	}
	return result;
}

function determineSchemaEntry(
	config: LoadedConfig,
	directorySchema: LoadedSchema,
	template: TemplateDefinition<Record<string, unknown>> | undefined,
	templateName?: string,
	requestedTemplateName?: string,
): LoadedSchema {
	if (!template?.schema) {
		return directorySchema;
	}

	const schemaEntry = config.getSchemaByName(template.schema);
	if (!schemaEntry) {
		throw new MdfError(
			"INVALID_CONTENT",
			`Template "${templateName ?? template.schema}" references unknown schema "${template.schema}" in ${config.path}`,
		);
	}

	if (!requestedTemplateName && schemaEntry.name !== directorySchema.name) {
		return directorySchema;
	}

	return schemaEntry;
}

async function resolveTemplate(
	config: LoadedConfig,
	templateName: string | undefined,
	schemaName: string,
): Promise<ResolvedTemplate | undefined> {
	const resolvedName = templateName ?? config.defaultTemplate?.[schemaName];

	if (!resolvedName) {
		return undefined;
	}

	const collection = config.templates;
	const template = collection?.[resolvedName];
	if (!template) {
		throw new MdfError(
			"TEMPLATE_NOT_FOUND",
			`Template "${resolvedName}" not found in ${config.path}`,
		);
	}

	return {
		name: resolvedName,
		template: template as TemplateDefinition<Record<string, unknown>>,
	};
}

async function resolveTemplateBody(
	body: NonNullable<TemplateDefinition<Record<string, unknown>>["body"]>,
	data: Record<string, unknown>,
	now: Date,
): Promise<string> {
	if (typeof body === "string") {
		return body;
	}

	const context = Object.assign({ now, data }, data) as TemplateBodyContext<
		Record<string, unknown>
	>;
	const result = await body(context);
	if (typeof result !== "string") {
		throw new MdfError("INVALID_CONTENT", "Template body must return a string");
	}
	return result;
}

async function buildInitialFrontMatter(
	config: LoadedConfig,
	schema: z.ZodTypeAny,
	inputs: string[],
	now: Date,
	template?: TemplateDefinition<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
	const defaults = await resolveDefaults(config, now, template);
	const cliValues = parseFrontMatterInputs(inputs);
	const combined = { ...defaults, ...cliValues };
	ensureRequiredStringFields(schema, combined);
	return combined;
}

async function resolveDefaults(
	config: LoadedConfig,
	now: Date,
	template?: TemplateDefinition<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
	const configDefaults = await resolveDefaultsValue(config.defaults, now);
	const templateDefaults = await resolveDefaultsValue(
		template?.frontmatter,
		now,
	);
	return { ...configDefaults, ...templateDefaults };
}

async function resolveDefaultsValue<TValue>(
	value: DefaultsValue<TValue> | undefined,
	now: Date,
): Promise<Record<string, unknown>> {
	if (!value) {
		return {};
	}

	if (typeof value === "function") {
		const result = await value({ now });
		return result ? { ...(result as Record<string, unknown>) } : {};
	}

	return { ...(value as Record<string, unknown>) };
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
	schema: z.ZodTypeAny,
	frontMatter: Record<string, unknown>,
): void {
	const baseSchema = unwrapSchema(schema);
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

function generateId(now: Date): string {
	// Default to ULID; prefer schema filename or --filename for customization
	return generateUlid(now);
}

// No UUID fallback; ULID is the fixed fallback strategy.

const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateUlid(now: Date): string {
	const time = BigInt(now.getTime()) & ((1n << 48n) - 1n);
	const timePart = encodeUlidSection(time, 10);

	const random = randomBytes(10);
	let randomValue = 0n;
	for (const byte of random) {
		randomValue = (randomValue << 8n) | BigInt(byte);
	}
	const randomPart = encodeUlidSection(randomValue, 16);

	return `${timePart}${randomPart}`;
}

function encodeUlidSection(value: bigint, length: number): string {
	let result = "";
	let current = value;
	for (let index = 0; index < length; index += 1) {
		const charIndex = Number(current % 32n);
		result = `${CROCKFORD32[charIndex]}${result}`;
		current /= 32n;
	}
	return result;
}

async function parseFrontMatter(
	schema: z.ZodTypeAny,
	candidate: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	try {
		const result = await schema.parseAsync(candidate);
		return result as Record<string, unknown>;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new MdfError("SCHEMA_VALIDATION", error.message);
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
