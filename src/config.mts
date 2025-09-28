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

export async function findConfigPath(baseDir: string): Promise<string | null> {
	for (const relative of CONFIG_CANDIDATES) {
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
	const configPath = await findConfigPath(baseDir);
	if (!configPath) {
		return null;
	}

	const rawConfig = await importConfig(configPath);
	const normalized = normalizeConfig(rawConfig, configPath);
	return {
		...normalized,
		path: configPath,
	};
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
