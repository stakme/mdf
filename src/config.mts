import { promises as fs } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { defineConfig, defineSchema, z } from "./index.mts";
import type {
	DocumentSort,
	IdGeneratorName,
	LoadedConfig,
	LoadedSchema,
	LoadedVirtualPathConfig,
	MdfConfig,
	SchemaFilenameGenerator,
	VirtualSlugConfig,
} from "./types.mts";

const packageRequire = Module.createRequire(
	new URL("../package.json", import.meta.url),
);

const CONFIG_CANDIDATES = [
	".config/mdf.mts",
	".config/mdf.ts",
	".config/mdf.mjs",
	".config/mdf.js",
	".config/mdf.cjs",
	".config/mdf.json",
];

const LOCAL_CONFIG_CANDIDATES = [
	".config/mdf.local.mts",
	".config/mdf.local.ts",
	".config/mdf.local.mjs",
	".config/mdf.local.js",
	".config/mdf.local.cjs",
	".config/mdf.local.json",
];

export async function findConfigPath(
	baseDir: string,
	candidates: readonly string[] = CONFIG_CANDIDATES,
): Promise<string | null> {
	for (const relative of candidates) {
		const candidate = path.resolve(baseDir, relative);
		try {
			await fs.access(candidate);
			return candidate;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}
	return null;
}

export async function loadConfig(
	baseDir: string,
): Promise<LoadedConfig | null> {
	const configPath = await findConfigPath(baseDir, CONFIG_CANDIDATES);
	if (!configPath) {
		return null;
	}

	const rawConfig = await importConfig(configPath);
	const normalized = normalizeConfig(rawConfig, configPath);
	const localConfig = await loadLocalConfig(baseDir);
	const mergedConfig = localConfig
		? mergeConfigs(normalized, localConfig.config, configPath, localConfig.path)
		: normalized;
	return finalizeConfig(mergedConfig, configPath);
}

async function loadLocalConfig(
	baseDir: string,
): Promise<{ config: NormalizedConfig; path: string } | null> {
	const localPath = await findConfigPath(baseDir, LOCAL_CONFIG_CANDIDATES);
	if (!localPath) {
		return null;
	}

	const rawConfig = await importConfig(localPath);
	const normalized = normalizeConfig(rawConfig, localPath);
	return { config: normalized, path: localPath };
}

async function importConfig(configPath: string): Promise<unknown> {
	const ext = path.extname(configPath);
	if (ext === ".mts" || ext === ".ts") {
		return loadTypeScriptConfig(configPath);
	}

	if (ext === ".mjs" || ext === ".js") {
		const mod = await import(pathToFileURL(configPath).href);
		return mod?.default ?? mod;
	}

	if (ext === ".cjs") {
		const requireForConfig = Module.createRequire(configPath);
		return requireForConfig(configPath);
	}

	if (ext === ".json") {
		const content = await fs.readFile(configPath, "utf8");
		return JSON.parse(content);
	}

	throw new Error(`Unsupported config extension: ${ext}`);
}

async function loadTypeScriptConfig(configPath: string): Promise<unknown> {
	const code = await fs.readFile(configPath, "utf8");
	const transpiled = ts.transpileModule(code, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true,
			allowSyntheticDefaultImports: true,
		},
		fileName: path.basename(configPath).replace(/\.mts$/u, ".ts"),
	});

	return evaluateCommonJs(transpiled.outputText, configPath);
}

function evaluateCommonJs(source: string, filename: string): unknown {
	const mod = { exports: {} as unknown };
	const dirname = path.dirname(filename);
	const requireForConfig = createResolver(filename);

	const sandbox = {
		module: mod,
		exports: mod.exports,
		require: requireForConfig,
		__filename: filename,
		__dirname: dirname,
		process,
		console,
		Buffer,
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
		setImmediate,
		clearImmediate,
	} as Record<string, unknown>;

	const script = new vm.Script(source, { filename });
	const context = vm.createContext(sandbox);
	script.runInContext(context);

	const exported = (mod as { exports: unknown }).exports as
		| Record<string, unknown>
		| undefined;
	if (!exported) {
		return undefined;
	}
	return exported.default ?? exported;
}

interface NormalizedConfig
	extends Omit<
		MdfConfig,
		"schema" | "defaultSchema" | "virtualPath" | "virtualSlug" | "aliases"
	> {
	schemas: readonly LoadedSchema[];
	defaultSchema: string;
	schemaPriority?: readonly string[];
	defaultTemplate?: Record<string, string>;
	virtualPath?: LoadedVirtualPathConfig;
	virtualSlug?: VirtualSlugConfig;
	idGenerator?: IdGeneratorName;
	aliases?: Record<string, string>;
}

function normalizeConfig(value: unknown, configPath: string): NormalizedConfig {
	if (!value || typeof value !== "object") {
		throw new Error(`mdf config at ${configPath} must export an object`);
	}

	const record = value as Record<string, unknown>;
	const schemaInput = record.schema;
	if (schemaInput === undefined) {
		throw new Error(
			`mdf config at ${configPath} must include a schema definition under the "schema" key`,
		);
	}

	const defaultSchemaCandidate = record.defaultSchema;

	const { definitions, defaultName, priority } = normalizeSchemaDefinitions(
		schemaInput,
		defaultSchemaCandidate,
		configPath,
	);

	const virtualPath = normalizeVirtualPath(record.virtualPath, configPath);
	const virtualSlug = normalizeVirtualSlug(record.virtualSlug, configPath);
	const idGenerator = normalizeIdGenerator(record.idGenerator, configPath);
	const aliases = normalizeAliases(record.aliases, configPath);
	const defaultTemplate = normalizeDefaultTemplates(
		record.defaultTemplate,
		configPath,
	);

	const clone = { ...record } as Record<string, unknown>;
	delete clone.schema;
	delete clone.defaultSchema;
	delete clone.virtualPath;
	delete clone.virtualSlug;
	delete clone.idGenerator;
	delete clone.aliases;
	delete clone.defaultTemplate;

	return {
		...(clone as Omit<
			MdfConfig,
			"schema" | "defaultSchema" | "virtualPath" | "aliases"
		>),
		schemas: definitions,
		defaultSchema: defaultName,
		schemaPriority: priority,
		defaultTemplate,
		virtualPath,
		virtualSlug,
		idGenerator,
		aliases,
	};
}

function normalizeAliases(
	input: unknown,
	configPath: string,
): Record<string, string> | undefined {
	if (input === undefined) {
		return undefined;
	}

	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error(
			`mdf config at ${configPath} must define "aliases" as an object mapping strings to strings`,
		);
	}

	const entries = Object.entries(input as Record<string, unknown>);
	const normalized: Record<string, string> = {};

	for (const [key, value] of entries) {
		const aliasName = key.trim();
		if (!aliasName) {
			throw new Error(
				`mdf config at ${configPath} must define aliases with non-empty names`,
			);
		}

		if (typeof value !== "string") {
			throw new Error(
				`mdf config at ${configPath} must define alias "${aliasName}" as a string`,
			);
		}

		const command = value.trim();
		if (!command) {
			throw new Error(
				`mdf config at ${configPath} must define alias "${aliasName}" with a non-empty command`,
			);
		}

		normalized[aliasName] = command;
	}

	return normalized;
}

function normalizeDefaultTemplates(
	input: unknown,
	configPath: string,
): Record<string, string> | undefined {
	if (input === undefined) {
		return undefined;
	}

	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error(
			`mdf config at ${configPath} must define "defaultTemplate" as an object mapping schema names to template names when provided`,
		);
	}

	const entries = Object.entries(input as Record<string, unknown>);
	const normalized: Record<string, string> = {};

	for (const [rawSchema, rawTemplate] of entries) {
		const schemaName = rawSchema.trim();
		if (!schemaName) {
			throw new Error(
				`mdf config at ${configPath} must define default template mappings with non-empty schema names`,
			);
		}

		if (typeof rawTemplate !== "string") {
			throw new Error(
				`mdf config at ${configPath} default template for schema "${schemaName}" must be a string`,
			);
		}

		const templateName = rawTemplate.trim();
		if (!templateName) {
			throw new Error(
				`mdf config at ${configPath} default template for schema "${schemaName}" must be a non-empty string`,
			);
		}

		normalized[schemaName] = templateName;
	}

	return normalized;
}

function normalizeVirtualPath(
	input: unknown,
	configPath: string,
): LoadedVirtualPathConfig | undefined {
	if (input === undefined) {
		return undefined;
	}

	if (!input || typeof input !== "object") {
		throw new Error(
			`mdf config at ${configPath} must define "virtualPath" as an object when provided`,
		);
	}

	const record = input as Record<string, unknown>;
	const param = record.param;
	if (typeof param !== "string" || !param.trim()) {
		throw new Error(
			`mdf config at ${configPath} must define virtualPath.param as a non-empty string`,
		);
	}

	const separatorInput = record.separator;
	if (separatorInput === undefined) {
		return {
			param: param.trim(),
			separator: "/",
		};
	}

	if (typeof separatorInput !== "string") {
		throw new Error(
			`mdf config at ${configPath} must define virtualPath.separator as a string when provided`,
		);
	}

	const separator = separatorInput.trim();
	if (!separator) {
		throw new Error(
			`mdf config at ${configPath} must define virtualPath.separator as a non-empty string when provided`,
		);
	}

	return {
		param: param.trim(),
		separator,
	};
}

function normalizeVirtualSlug(
	input: unknown,
	configPath: string,
): VirtualSlugConfig | undefined {
	if (input === undefined) {
		return undefined;
	}

	if (!input || typeof input !== "object") {
		throw new Error(
			`mdf config at ${configPath} must define "virtualSlug" as an object when provided`,
		);
	}

	const record = input as Record<string, unknown>;
	const param = record.param;
	if (typeof param !== "string") {
		throw new Error(
			`mdf config at ${configPath} must define virtualSlug.param as a string when provided`,
		);
	}

	const trimmed = param.trim();
	if (!trimmed) {
		throw new Error(
			`mdf config at ${configPath} must define virtualSlug.param as a non-empty string`,
		);
	}

	return { param: trimmed };
}

function normalizeIdGenerator(
	input: unknown,
	configPath: string,
): IdGeneratorName | undefined {
	if (input === undefined) {
		return undefined;
	}

	if (input === "uuid" || input === "ulid") {
		return input;
	}

	throw new Error(
		`mdf config at ${configPath} must define "idGenerator" as either "ulid" or "uuid" when provided`,
	);
}

function mergeConfigs(
	base: NormalizedConfig,
	override: NormalizedConfig,
	baseConfigPath: string,
	localConfigPath: string,
): NormalizedConfig {
	const { definitions, defaultName, priority } = mergeSchemaDefinitions(
		base.schemas,
		base.defaultSchema,
		base.schemaPriority,
		override.schemas,
		override.defaultSchema,
		override.schemaPriority,
		baseConfigPath,
		localConfigPath,
	);
	return {
		...base,
		schemas: definitions,
		defaultSchema: defaultName,
		schemaPriority: priority,
		defaults: override.defaults ?? base.defaults,
		content: override.content ?? base.content,
		fileName: override.fileName ?? base.fileName,
		extension: override.extension ?? base.extension,
		templates: mergeTemplates(base.templates, override.templates),
		defaultTemplate: mergeDefaultTemplates(
			base.defaultTemplate,
			override.defaultTemplate,
		),
		virtualPath: override.virtualPath ?? base.virtualPath,
		virtualSlug: override.virtualSlug ?? base.virtualSlug,
		idGenerator: override.idGenerator ?? base.idGenerator,
		aliases: mergeAliases(base.aliases, override.aliases),
	};
}

function mergeAliases(
	baseAliases: Record<string, string> | undefined,
	overrideAliases: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!baseAliases) {
		return overrideAliases;
	}

	if (!overrideAliases) {
		return baseAliases;
	}

	return { ...baseAliases, ...overrideAliases };
}

function mergeTemplates(
	baseTemplates: MdfConfig["templates"],
	overrideTemplates: MdfConfig["templates"],
): MdfConfig["templates"] {
	if (!baseTemplates) {
		return overrideTemplates;
	}

	if (!overrideTemplates) {
		return baseTemplates;
	}

	return { ...baseTemplates, ...overrideTemplates };
}

function mergeDefaultTemplates(
	baseDefaults: Record<string, string> | undefined,
	overrideDefaults: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!baseDefaults) {
		return overrideDefaults ? { ...overrideDefaults } : undefined;
	}

	if (!overrideDefaults) {
		return { ...baseDefaults };
	}

	return { ...baseDefaults, ...overrideDefaults };
}

function mergeSchemas(
	baseSchema: z.ZodTypeAny,
	overrideSchema: z.ZodTypeAny,
	baseConfigPath: string,
	localConfigPath: string,
): z.ZodTypeAny {
	if (
		baseSchema instanceof z.ZodObject &&
		overrideSchema instanceof z.ZodObject
	) {
		return baseSchema.merge(overrideSchema);
	}

	if (!(overrideSchema instanceof z.ZodObject)) {
		return overrideSchema;
	}

	throw new Error(
		`mdf local config at ${localConfigPath} must provide a Zod object schema to extend ${baseConfigPath}`,
	);
}

function isZodType(value: unknown): value is z.ZodTypeAny {
	return Boolean(value) && typeof (value as z.ZodTypeAny).parse === "function";
}

function createResolver(configFile: string) {
	const localRequire = Module.createRequire(configFile);
	return function resolve(request: string) {
		if (request === "@stakme/mdf/config") {
			return { defineConfig, defineSchema, z };
		}

		try {
			return localRequire(request);
		} catch (error) {
			if (
				(error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND" &&
				isBareSpecifier(request)
			) {
				return packageRequire(request);
			}
			throw error;
		}
	};
}

function finalizeConfig(
	config: NormalizedConfig,
	configPath: string,
): LoadedConfig {
	const schemas = config.schemas.map((entry) => ({ ...entry }));
	validateTemplateSchemas(config.templates, schemas, configPath);
	validateDefaultTemplateMappings(
		config.defaultTemplate,
		config.templates,
		schemas,
		configPath,
	);
	const schemaLookup = new Map<string, LoadedSchema>(
		schemas.map((entry) => [entry.name, entry] as const),
	);
	const selector = createSchemaSelector(
		schemas,
		config.defaultSchema,
		configPath,
		config.schemaPriority,
	);
	return {
		...config,
		schema: selector.defaultSchema.schema,
		schemas,
		defaultSchema: selector.defaultSchema.name,
		schemaPriority: config.schemaPriority,
		defaultTemplate: config.defaultTemplate
			? { ...config.defaultTemplate }
			: undefined,
		getSchemaForRelativePath(relativePath: string): LoadedSchema {
			return selector.select(relativePath);
		},
		getSchemaByName(name: string): LoadedSchema | undefined {
			return schemaLookup.get(name);
		},
		path: configPath,
		idGenerator: config.idGenerator ?? "ulid",
		aliases: config.aliases ? { ...config.aliases } : undefined,
	};
}

function validateTemplateSchemas(
	templates: NormalizedConfig["templates"],
	schemas: readonly LoadedSchema[],
	configPath: string,
): void {
	if (!templates) {
		return;
	}

	const available = new Set(schemas.map((entry) => entry.name));

	for (const [templateName, template] of Object.entries(templates)) {
		if (!template || typeof template !== "object") {
			continue;
		}

		const schemaRef = (template as { schema?: unknown }).schema;
		if (schemaRef === undefined) {
			continue;
		}

		if (typeof schemaRef !== "string") {
			throw new Error(
				`mdf config at ${configPath} must define template "${templateName}" schema as a string when provided`,
			);
		}

		const normalized = schemaRef.trim();
		if (!normalized) {
			throw new Error(
				`mdf config at ${configPath} must define template "${templateName}" schema as a non-empty string when provided`,
			);
		}

		if (!available.has(normalized)) {
			throw new Error(
				`mdf config at ${configPath} template "${templateName}" references unknown schema "${normalized}"`,
			);
		}

		(template as { schema: string }).schema = normalized;
	}
}

function validateDefaultTemplateMappings(
	mappings: NormalizedConfig["defaultTemplate"],
	templates: NormalizedConfig["templates"],
	schemas: readonly LoadedSchema[],
	configPath: string,
): void {
	if (!mappings) {
		return;
	}

	const availableSchemas = new Set(schemas.map((entry) => entry.name));
	const availableTemplates = new Set(
		Object.keys(templates ?? {}).map((entry) => entry.trim()),
	);

	if (!templates || availableTemplates.size === 0) {
		const [firstSchema] = Object.keys(mappings);
		if (firstSchema) {
			throw new Error(
				`mdf config at ${configPath} defaultTemplate references template "${mappings[firstSchema]}" but no templates are defined`,
			);
		}
		return;
	}

	for (const [schemaName, templateName] of Object.entries(mappings)) {
		if (!availableSchemas.has(schemaName)) {
			throw new Error(
				`mdf config at ${configPath} defaultTemplate references unknown schema "${schemaName}"`,
			);
		}

		if (!availableTemplates.has(templateName)) {
			throw new Error(
				`mdf config at ${configPath} defaultTemplate for schema "${schemaName}" references unknown template "${templateName}"`,
			);
		}
	}
}

interface DefaultSchemaCandidate {
	defaultName?: string;
	priority?: readonly string[];
}

function normalizeSchemaDefinitions(
	input: unknown,
	defaultSchema: unknown,
	configPath: string,
): {
	definitions: readonly LoadedSchema[];
	defaultName: string;
	priority?: readonly string[];
} {
	const candidate = normalizeDefaultSchemaCandidate(defaultSchema, configPath);

	if (isZodType(input)) {
		const entryName = candidate.defaultName ?? "default";
		const entry: LoadedSchema = { name: entryName, schema: input };
		const resolvedCandidate: DefaultSchemaCandidate = candidate.defaultName
			? candidate
			: { defaultName: entryName, priority: candidate.priority };
		return finalizeSchemaEntries([entry], resolvedCandidate, configPath);
	}

	if (Array.isArray(input)) {
		if (input.length === 0) {
			throw new Error(
				`mdf config at ${configPath} must define at least one schema entry`,
			);
		}
		const entries = input.map((entry, index) =>
			normalizeSchemaEntry(entry, configPath, index),
		);
		return finalizeSchemaEntries(entries, candidate, configPath);
	}

	if (input && typeof input === "object") {
		const record = input as Record<string, unknown>;
		if ("name" in record) {
			const entry = normalizeSchemaEntry(record, configPath);
			return finalizeSchemaEntries([entry], candidate, configPath);
		}

		const entries = normalizeSchemaRecordEntries(record, configPath);
		return finalizeSchemaEntries(entries, candidate, configPath);
	}

	throw new Error(
		`mdf config at ${configPath} must define "schema" as a Zod schema, an array of schema definitions, or an object mapping schema names to definitions`,
	);
}

function normalizeSchemaEntry(
	entry: unknown,
	configPath: string,
	index?: number,
): LoadedSchema {
	if (!entry || typeof entry !== "object") {
		throw new Error(
			`Schema entry ${formatSchemaIndex(index)} in ${configPath} must be an object`,
		);
	}

	const record = entry as Record<string, unknown>;
	const name = record.name;
	if (typeof name !== "string" || !name.trim()) {
		throw new Error(
			`Schema entry ${formatSchemaIndex(index)} in ${configPath} must include a non-empty string "name"`,
		);
	}

	const schema = record.schema;
	if (!isZodType(schema)) {
		throw new Error(
			`Schema entry "${name}" in ${configPath} must include a Zod schema under the "schema" key`,
		);
	}

	const glob = record.glob;
	if (glob !== undefined && (typeof glob !== "string" || !glob.trim())) {
		throw new Error(
			`Schema entry "${name}" in ${configPath} must define "glob" as a non-empty string when provided`,
		);
	}

	return {
		name,
		schema,
		glob: typeof glob === "string" ? glob : undefined,
		sort: normalizeSortFunction(record.sort, name, configPath),
		filenameGenerator: normalizeFilenameGenerator(
			record.filenameGenerator,
			name,
			configPath,
		),
		visibleFields: normalizeVisibleFields(
			record.visibleFields,
			name,
			configPath,
		),
	};
}

function normalizeSchemaRecordEntries(
	entries: Record<string, unknown>,
	configPath: string,
): readonly LoadedSchema[] {
	const names = Object.keys(entries);
	if (names.length === 0) {
		throw new Error(
			`mdf config at ${configPath} must define at least one schema entry`,
		);
	}

	return names.map((rawName) =>
		normalizeSchemaRecordEntry(rawName, entries[rawName], configPath),
	);
}

function normalizeSchemaRecordEntry(
	name: string,
	entry: unknown,
	configPath: string,
): LoadedSchema {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error(
			`mdf config at ${configPath} must define schema entries with non-empty names`,
		);
	}

	if (isZodType(entry)) {
		return {
			name: trimmedName,
			schema: entry,
		};
	}

	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		throw new Error(
			`Schema entry "${trimmedName}" in ${configPath} must be defined as a Zod schema or an object`,
		);
	}

	const record = entry as Record<string, unknown>;
	const schema = record.schema;
	if (!isZodType(schema)) {
		throw new Error(
			`Schema entry "${trimmedName}" in ${configPath} must include a Zod schema under the "schema" key`,
		);
	}

	const glob = record.glob;
	if (glob !== undefined && (typeof glob !== "string" || !glob.trim())) {
		throw new Error(
			`Schema entry "${trimmedName}" in ${configPath} must define "glob" as a non-empty string when provided`,
		);
	}

	return {
		name: trimmedName,
		schema,
		glob: typeof glob === "string" ? glob : undefined,
		sort: normalizeSortFunction(record.sort, trimmedName, configPath),
		filenameGenerator: normalizeFilenameGenerator(
			record.filenameGenerator,
			trimmedName,
			configPath,
		),
		visibleFields: normalizeVisibleFields(
			record.visibleFields,
			trimmedName,
			configPath,
		),
	};
}

function normalizeSortFunction(
	value: unknown,
	schemaName: string,
	configPath: string,
): DocumentSort<unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "function") {
		throw new Error(
			`Schema entry "${schemaName}" in ${configPath} must define "sort" as a function when provided`,
		);
	}

	return value as DocumentSort<unknown>;
}

function normalizeVisibleFields(
	value: unknown,
	schemaName: string,
	configPath: string,
): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		throw new Error(
			`Schema entry "${schemaName}" in ${configPath} must define "visibleFields" as an array of strings when provided`,
		);
	}

	const seen = new Set<string>();
	const normalized: string[] = [];
	value.forEach((entry, index) => {
		if (typeof entry !== "string") {
			throw new Error(
				`Schema entry "${schemaName}" in ${configPath} visibleFields entry ${formatSchemaIndex(index)} must be a string`,
			);
		}

		const trimmed = entry.trim();
		if (!trimmed) {
			throw new Error(
				`Schema entry "${schemaName}" in ${configPath} visibleFields entry ${formatSchemaIndex(index)} must be a non-empty string`,
			);
		}

		if (seen.has(trimmed)) {
			return;
		}
		seen.add(trimmed);
		normalized.push(trimmed);
	});

	return normalized;
}

function normalizeFilenameGenerator(
	value: unknown,
	schemaName: string,
	configPath: string,
): SchemaFilenameGenerator<unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "function") {
		throw new Error(
			`Schema entry "${schemaName}" in ${configPath} must define "filenameGenerator" as a function when provided`,
		);
	}

	return value as SchemaFilenameGenerator<unknown>;
}

function finalizeSchemaEntries(
	entries: readonly LoadedSchema[],
	candidate: DefaultSchemaCandidate,
	configPath: string,
): {
	definitions: readonly LoadedSchema[];
	defaultName: string;
	priority?: readonly string[];
} {
	const seen = new Set<string>();
	for (const entry of entries) {
		if (seen.has(entry.name)) {
			throw new Error(
				`mdf config at ${configPath} contains duplicate schema name "${entry.name}"`,
			);
		}
		seen.add(entry.name);
	}

	const resolved = ensureDefaultSchema(entries, candidate, configPath);
	return {
		definitions: entries,
		defaultName: resolved.defaultName,
		priority: resolved.priority,
	};
}

function ensureDefaultSchema(
	entries: readonly LoadedSchema[],
	candidate: DefaultSchemaCandidate,
	configPath: string,
): { defaultName: string; priority?: readonly string[] } {
	const names = new Set(entries.map((entry) => entry.name));
	const resolvedDefault = candidate.defaultName ?? entries[0]?.name;
	if (!resolvedDefault || !names.has(resolvedDefault)) {
		const available = entries.map((entry) => `"${entry.name}"`).join(", ");
		throw new Error(
			`mdf config at ${configPath} must set "defaultSchema" to one of: ${available}`,
		);
	}

	const priority = candidate.priority;
	if (!priority || priority.length === 0) {
		return { defaultName: resolvedDefault };
	}

	const missing = priority.filter((name) => !names.has(name));
	if (missing.length > 0) {
		const missingList = missing.map((name) => `"${name}"`).join(", ");
		throw new Error(
			`mdf config at ${configPath} default schema priority references unknown schema(s): ${missingList}`,
		);
	}

	const last = priority[priority.length - 1];
	if (last !== resolvedDefault) {
		throw new Error(
			`mdf config at ${configPath} default schema priority must end with the default schema "${resolvedDefault}"`,
		);
	}

	return { defaultName: resolvedDefault, priority };
}

function mergeSchemaDefinitions(
	baseEntries: readonly LoadedSchema[],
	baseDefault: string,
	basePriority: readonly string[] | undefined,
	overrideEntries: readonly LoadedSchema[],
	overrideDefault: string,
	overridePriority: readonly string[] | undefined,
	baseConfigPath: string,
	localConfigPath: string,
): {
	definitions: readonly LoadedSchema[];
	defaultName: string;
	priority?: readonly string[];
} {
	const merged = new Map<string, LoadedSchema>();
	for (const entry of baseEntries) {
		merged.set(entry.name, { ...entry });
	}

	for (const entry of overrideEntries) {
		const existing = merged.get(entry.name);
		if (!existing) {
			merged.set(entry.name, { ...entry });
			continue;
		}

		const mergedSchema = mergeSchemas(
			existing.schema,
			entry.schema,
			baseConfigPath,
			localConfigPath,
		);

		merged.set(entry.name, {
			name: entry.name,
			schema: mergedSchema,
			glob: entry.glob ?? existing.glob,
			sort: entry.sort ?? existing.sort,
			filenameGenerator: entry.filenameGenerator ?? existing.filenameGenerator,
			visibleFields: entry.visibleFields ?? existing.visibleFields,
		});
	}

	const ordered = Array.from(merged.values());
	const defaultCandidate = merged.has(overrideDefault)
		? overrideDefault
		: baseDefault;

	let priorityCandidate: readonly string[] | undefined;
	if (overridePriority && overridePriority.length > 0) {
		priorityCandidate = overridePriority;
	} else if (
		overridePriority === undefined &&
		overrideDefault === baseDefault
	) {
		priorityCandidate = basePriority;
	}

	const candidate: DefaultSchemaCandidate = {
		defaultName: defaultCandidate,
		priority: priorityCandidate,
	};

	return finalizeSchemaEntries(ordered, candidate, localConfigPath);
}

function normalizeDefaultSchemaCandidate(
	input: unknown,
	configPath: string,
): DefaultSchemaCandidate {
	if (input === undefined) {
		return {};
	}

	if (typeof input === "string") {
		const trimmed = input.trim();
		if (!trimmed) {
			throw new Error(
				`mdf config at ${configPath} must define "defaultSchema" as a non-empty string when provided`,
			);
		}
		return { defaultName: trimmed };
	}

	if (Array.isArray(input)) {
		if (input.length === 0) {
			throw new Error(
				`mdf config at ${configPath} must define "defaultSchema" as a non-empty array when provided`,
			);
		}

		const normalized: string[] = [];
		const seen = new Set<string>();
		for (const value of input) {
			if (typeof value !== "string") {
				throw new Error(
					`mdf config at ${configPath} must define "defaultSchema" entries as strings`,
				);
			}

			const trimmed = value.trim();
			if (!trimmed) {
				throw new Error(
					`mdf config at ${configPath} must define "defaultSchema" entries as non-empty strings`,
				);
			}

			if (seen.has(trimmed)) {
				throw new Error(
					`mdf config at ${configPath} must not repeat schema "${trimmed}" in default schema priority`,
				);
			}

			seen.add(trimmed);
			normalized.push(trimmed);
		}

		return {
			defaultName: normalized[normalized.length - 1],
			priority: normalized,
		};
	}

	throw new Error(
		`mdf config at ${configPath} must define "defaultSchema" as a string or array of strings when provided`,
	);
}

function createSchemaSelector(
	entries: readonly LoadedSchema[],
	defaultName: string,
	configPath: string,
	priority: readonly string[] | undefined,
): {
	defaultSchema: LoadedSchema;
	select(relativePath: string): LoadedSchema;
} {
	const defaultSchema = entries.find((entry) => entry.name === defaultName);
	if (!defaultSchema) {
		const available = entries.map((entry) => `"${entry.name}"`).join(", ");
		throw new Error(
			`mdf config at ${configPath} could not resolve default schema. Available schemas: ${available}`,
		);
	}

	let orderedEntries = entries;
	if (priority && priority.length > 0) {
		const lookup = new Map(
			entries.map((entry) => [entry.name, entry] as const),
		);
		const seen = new Set<string>();
		const prioritized: LoadedSchema[] = [];

		for (const name of priority) {
			if (seen.has(name)) {
				continue;
			}
			const entry = lookup.get(name);
			if (!entry) {
				continue;
			}
			prioritized.push(entry);
			seen.add(name);
		}

		if (seen.size > 0) {
			const remaining = entries.filter((entry) => !seen.has(entry.name));
			orderedEntries = prioritized.concat(remaining);
		}
	}

	const matchers = orderedEntries
		.filter((entry) => entry.glob)
		.map((entry) => ({
			entry,
			pattern: compileGlob(entry.glob as string),
		}));

	return {
		defaultSchema,
		select(relativePath: string): LoadedSchema {
			const normalized = normalizeRelativePath(relativePath);
			for (const matcher of matchers) {
				if (matcher.pattern.test(normalized)) {
					return matcher.entry;
				}
			}
			return defaultSchema;
		},
	};
}

function normalizeRelativePath(relativePath: string): string {
	let normalized = relativePath.replace(/\\/g, "/");
	while (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	normalized = normalized.replace(/^\/+|\/+$/g, "");
	return normalized;
}

function compileGlob(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const withDoubleStar = escaped.replace(/\*\*/g, "__DOUBLE_STAR__");
	const withSingleStar = withDoubleStar.replace(/\*/g, "[^/]*");
	const withQuestion = withSingleStar.replace(/\?/g, "[^/]");
	const finalPattern = withQuestion.replace(/__DOUBLE_STAR__/g, ".*");
	return new RegExp(`^${finalPattern}$`);
}

function formatSchemaIndex(index?: number): string {
	if (index === undefined) {
		return "";
	}
	return `#${index + 1}`;
}

function isBareSpecifier(request: string): boolean {
	return (
		!request.startsWith("./") &&
		!request.startsWith("../") &&
		!path.isAbsolute(request)
	);
}
