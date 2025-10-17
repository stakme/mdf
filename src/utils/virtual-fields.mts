import path from "node:path";
import { MdfError } from "../errors.mts";
import type { LoadedSchema, SchemaVirtualResolverContext } from "../types.mts";
import {
	computeDirectoryRelativePath,
	normalizeVirtualSlugValue,
	resolveDocumentSlug,
} from "./document-paths.mts";

export const DEFAULT_VIRTUAL_PATH_SEPARATOR = "/";

export interface ComputeVirtualFieldsOptions {
	schema: LoadedSchema;
	frontMatter: Record<string, unknown>;
	filePath: string;
	rootDirectory: string;
	cwd: string;
}

export interface ComputedVirtualFields {
	virtualPath: string;
	virtualPathSegments: string[];
	virtualPathSource: "schema" | "default";
	slug: string;
	relativePath: string;
	filename: string;
}

export async function computeVirtualFields(
	options: ComputeVirtualFieldsOptions,
): Promise<ComputedVirtualFields> {
	const { schema, frontMatter, filePath, rootDirectory, cwd } = options;
	const relativePath = computeDirectoryRelativePath(filePath, rootDirectory);
	const filename = path.basename(filePath);
	const resolverRelativePath = relativePath.startsWith("./")
		? relativePath
		: `./${relativePath}`;

	const resolverContext: SchemaVirtualResolverContext<unknown> = {
		fm: frontMatter,
		filename,
		relativePath: resolverRelativePath,
	};

	const defaultSegments = relativePath
		.split("/")
		.slice(0, -1)
		.filter((segment) => segment.length > 0);
	const defaultVirtualPath =
		defaultSegments.length === 0 ? "/" : `/${defaultSegments.join("/")}`;

	const virtualPath = await resolveVirtualPathValue({
		schema,
		context: resolverContext,
		fallback: defaultVirtualPath,
	});

	const slug = await resolveVirtualSlugValue({
		schema,
		context: resolverContext,
		frontMatter,
		filePath,
		rootDirectory,
		cwd,
		relativePath,
	});

	return {
		virtualPath: virtualPath.value,
		virtualPathSegments: splitVirtualPath(virtualPath.value),
		virtualPathSource: virtualPath.source,
		slug,
		relativePath,
		filename,
	};
}

interface ResolveVirtualPathOptions {
	schema: LoadedSchema;
	context: SchemaVirtualResolverContext<unknown>;
	fallback: string;
}

async function resolveVirtualPathValue(
	options: ResolveVirtualPathOptions,
): Promise<{ value: string; source: "schema" | "default" }> {
	const { schema, context, fallback } = options;
	if (!schema.vpath) {
		return { value: fallback, source: "default" };
	}

	const raw = await schema.vpath(context);
	if (typeof raw !== "string") {
		throw new MdfError(
			"INVALID_VIRTUAL_PATH_VALUE",
			`Schema vpath for "${schema.name}" must return a string`,
		);
	}

	const normalized = raw.replace(/\\/gu, "/").trim();
	if (!normalized) {
		throw new MdfError(
			"INVALID_VIRTUAL_PATH_VALUE",
			`Schema vpath for "${schema.name}" must return a non-empty string`,
		);
	}

	return { value: normalized, source: "schema" };
}

interface ResolveVirtualSlugOptions {
	schema: LoadedSchema;
	context: SchemaVirtualResolverContext<unknown>;
	frontMatter: Record<string, unknown>;
	filePath: string;
	rootDirectory: string;
	cwd: string;
	relativePath: string;
}

async function resolveVirtualSlugValue(
	options: ResolveVirtualSlugOptions,
): Promise<string> {
	const { schema, context, frontMatter, filePath, cwd, relativePath } = options;
	if (!schema.vslug) {
		return resolveDocumentSlug({
			frontMatter,
			relativePath,
			filePath,
			cwd,
			slugField: undefined,
		});
	}

	const raw = await schema.vslug(context);
	if (typeof raw !== "string") {
		throw new MdfError(
			"INVALID_VIRTUAL_SLUG_VALUE",
			`Schema vslug for "${schema.name}" must return a string`,
		);
	}

	const trimmed = raw.trim();
	if (!trimmed) {
		throw new MdfError(
			"INVALID_VIRTUAL_SLUG_VALUE",
			`Schema vslug for "${schema.name}" must return a non-empty string`,
		);
	}

	return normalizeVirtualSlugValue(
		trimmed,
		`schema.vslug(${schema.name})`,
		filePath,
		cwd,
	);
}

export function splitVirtualPath(value: string): string[] {
	return value
		.replace(/\\/gu, "/")
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}
