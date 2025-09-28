import { promises as fs } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { defineConfig, z } from "./index.mts";
import type { LoadedConfig, MarkdfmConfig } from "./types.mts";

const packageRequire = Module.createRequire(
	new URL("../package.json", import.meta.url),
);

const CONFIG_CANDIDATES = [
        ".config/markdfm.mts",
        ".config/markdfm.ts",
        ".config/markdfm.mjs",
        ".config/markdfm.js",
        ".config/markdfm.cjs",
        ".config/markdfm.json",
];

const LOCAL_CONFIG_CANDIDATES = [
        ".config/markdfm.local.mts",
        ".config/markdfm.local.ts",
        ".config/markdfm.local.mjs",
        ".config/markdfm.local.js",
        ".config/markdfm.local.cjs",
        ".config/markdfm.local.json",
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
        return {
                ...mergedConfig,
                path: configPath,
        };
}

async function loadLocalConfig(
        baseDir: string,
): Promise<{ config: MarkdfmConfig; path: string } | null> {
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

function normalizeConfig(value: unknown, configPath: string): MarkdfmConfig {
        if (!value || typeof value !== "object") {
                throw new Error(`markdfm config at ${configPath} must export an object`);
        }

	const maybeSchema = (value as Record<string, unknown>).schema;
	if (!isZodType(maybeSchema)) {
		throw new Error(
			`markdfm config at ${configPath} must include a Zod schema under the "schema" key`,
		);
	}

        return value as MarkdfmConfig;
}

function mergeConfigs(
        base: MarkdfmConfig,
        override: MarkdfmConfig,
        baseConfigPath: string,
        localConfigPath: string,
): MarkdfmConfig {
        const schema = mergeSchemas(
                base.schema,
                override.schema,
                baseConfigPath,
                localConfigPath,
        );
        return {
                ...base,
                schema,
                defaults: override.defaults ?? base.defaults,
                content: override.content ?? base.content,
                fileName: override.fileName ?? base.fileName,
                extension: override.extension ?? base.extension,
        };
}

function mergeSchemas(
        baseSchema: z.ZodTypeAny,
        overrideSchema: z.ZodTypeAny,
        baseConfigPath: string,
        localConfigPath: string,
): z.ZodTypeAny {
        if (baseSchema instanceof z.ZodObject && overrideSchema instanceof z.ZodObject) {
                return baseSchema.merge(overrideSchema);
        }

        if (!(overrideSchema instanceof z.ZodObject)) {
                return overrideSchema;
        }

        throw new Error(
                `markdfm local config at ${localConfigPath} must provide a Zod object schema to extend ${baseConfigPath}`,
        );
}

function isZodType(value: unknown): value is z.ZodTypeAny {
	return Boolean(value) && typeof (value as z.ZodTypeAny).parse === "function";
}

function createResolver(configFile: string) {
	const localRequire = Module.createRequire(configFile);
	return function resolve(request: string) {
		if (request === "markdfm/config") {
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

function isBareSpecifier(request: string): boolean {
	return (
		!request.startsWith("./") &&
		!request.startsWith("../") &&
		!path.isAbsolute(request)
	);
}
