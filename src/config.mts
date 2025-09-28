import { promises as fs } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { defineConfig, z } from "./index.mts";
import type {
	IdGeneratorName,
	LoadedConfig,
	LoadedSchema,
	LoadedVirtualPathConfig,
	MdfConfig,
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
		"schema" | "defaultSchema" | "virtualPath" | "aliases"
	> {
	schemas: readonly LoadedSchema[];
	defaultSchema: string;
	virtualPath?: LoadedVirtualPathConfig;
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
	if (
		defaultSchemaCandidate !== undefined &&
		(typeof defaultSchemaCandidate !== "string" ||
			!defaultSchemaCandidate.trim())
	) {
		throw new Error(
			`mdf config at ${configPath} must define "defaultSchema" as a non-empty string when provided`,
		);
	}

	const { definitions, defaultName } = normalizeSchemaDefinitions(
		schemaInput,
		typeof defaultSchemaCandidate === "string"
			? defaultSchemaCandidate
			: undefined,
		configPath,
	);

	const virtualPath = normalizeVirtualPath(record.virtualPath, configPath);
	const idGenerator = normalizeIdGenerator(record.idGenerator, configPath);
	const aliases = normalizeAliases(record.aliases, configPath);

	const clone = { ...record } as Record<string, unknown>;
	delete clone.schema;
	delete clone.defaultSchema;
	delete clone.virtualPath;
	delete clone.idGenerator;
	delete clone.aliases;

	return {
		...(clone as Omit<
			MdfConfig,
			"schema" | "defaultSchema" | "virtualPath" | "aliases"
		>),
		schemas: definitions,
		defaultSchema: defaultName,
		virtualPath,
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
	const { definitions, defaultName } = mergeSchemaDefinitions(
		base.schemas,
		base.defaultSchema,
		override.schemas,
		override.defaultSchema,
		baseConfigPath,
		localConfigPath,
	);
	return {
		...base,
		schemas: definitions,
		defaultSchema: defaultName,
		defaults: override.defaults ?? base.defaults,
		content: override.content ?? base.content,
		fileName: override.fileName ?? base.fileName,
		extension: override.extension ?? base.extension,
		templates: mergeTemplates(base.templates, override.templates),
		defaultTemplate: override.defaultTemplate ?? base.defaultTemplate,
		virtualPath: override.virtualPath ?? base.virtualPath,
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
			return { defineConfig, z };
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
	const selector = createSchemaSelector(
		schemas,
		config.defaultSchema,
		configPath,
	);
	return {
		...config,
		schema: selector.defaultSchema.schema,
		schemas,
		defaultSchema: selector.defaultSchema.name,
		getSchemaForRelativePath(relativePath: string): LoadedSchema {
			return selector.select(relativePath);
		},
		path: configPath,
		idGenerator: config.idGenerator ?? "ulid",
		aliases: config.aliases ? { ...config.aliases } : undefined,
	};
}

function normalizeSchemaDefinitions(
	input: unknown,
	defaultSchema: string | undefined,
	configPath: string,
): { definitions: readonly LoadedSchema[]; defaultName: string } {
	if (isZodType(input)) {
		const name = defaultSchema ?? "default";
		return {
			definitions: [{ name, schema: input }],
			defaultName: name,
		};
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
		return finalizeSchemaEntries(entries, defaultSchema, configPath);
	}

	if (input && typeof input === "object") {
		const entry = normalizeSchemaEntry(input, configPath);
		return finalizeSchemaEntries([entry], defaultSchema, configPath);
	}

	throw new Error(
		`mdf config at ${configPath} must define "schema" as a Zod schema or an array of schema definitions`,
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
	};
}

function finalizeSchemaEntries(
	entries: readonly LoadedSchema[],
	defaultSchema: string | undefined,
	configPath: string,
): { definitions: readonly LoadedSchema[]; defaultName: string } {
	const seen = new Set<string>();
	for (const entry of entries) {
		if (seen.has(entry.name)) {
			throw new Error(
				`mdf config at ${configPath} contains duplicate schema name "${entry.name}"`,
			);
		}
		seen.add(entry.name);
	}

	const resolvedDefault = defaultSchema ?? entries[0]?.name;
	if (!resolvedDefault || !seen.has(resolvedDefault)) {
		const available = entries.map((entry) => `"${entry.name}"`).join(", ");
		throw new Error(
			`mdf config at ${configPath} must set "defaultSchema" to one of: ${available}`,
		);
	}

	return { definitions: entries, defaultName: resolvedDefault };
}

function mergeSchemaDefinitions(
	baseEntries: readonly LoadedSchema[],
	baseDefault: string,
	overrideEntries: readonly LoadedSchema[],
	overrideDefault: string,
	baseConfigPath: string,
	localConfigPath: string,
): { definitions: readonly LoadedSchema[]; defaultName: string } {
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
		});
	}

	const ordered = Array.from(merged.values());
	const defaultCandidate = merged.has(overrideDefault)
		? overrideDefault
		: baseDefault;

	return finalizeSchemaEntries(ordered, defaultCandidate, localConfigPath);
}

function createSchemaSelector(
	entries: readonly LoadedSchema[],
	defaultName: string,
	configPath: string,
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

	const matchers = entries
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
