import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadConfig } from "../config.mts";
import { MarkdfmError } from "../errors.mts";
import { parseFrontMatterInputs } from "../front-matter-inputs.mts";
import {
        readMarkdownDocument,
        serializeMarkdownDocument,
} from "../front-matter.mts";
import type { DefaultsValue } from "../types.mts";

export interface UpdateCommandOptions {
        cwd: string;
        files: string[];
        frontMatterInputs: string[];
        now?: Date;
}

export interface UpdateCommandResult {
        updated: string[];
        skipped: UpdateIssue[];
}

export interface UpdateIssue {
        filePath: string;
        messages: string[];
}

interface ParsedUpdateInputs {
        explicit: Record<string, unknown>;
        defaultKeys: Set<string>;
}

export async function runUpdateCommand(
        options: UpdateCommandOptions,
): Promise<UpdateCommandResult> {
        const config = await loadConfig(options.cwd);
        if (!config) {
                throw new MarkdfmError(
                        "CONFIG_NOT_FOUND",
                        "Could not find a markdfm config file. Create one at .config/markdfm.mts",
                );
        }

        if (!options.files.length) {
                throw new MarkdfmError(
                        "INVALID_UPDATE_INPUT",
                        "At least one Markdown file must be provided",
                );
        }

        const now = options.now ?? new Date();
        const parsedInputs = parseUpdateInputs(options.frontMatterInputs);
        const configDefaults = await resolveDefaultsValue(config.defaults, now);

        const updated: string[] = [];
        const skipped: UpdateIssue[] = [];

        for (const relativeFile of options.files) {
                const filePath = path.resolve(options.cwd, relativeFile);
                const schemaEntry = config.getSchemaForRelativePath(
                        path.relative(options.cwd, filePath),
                );
                try {
                        const document = await readMarkdownDocument(filePath);
                        const updateResult = await updateDocument({
                                schema: schemaEntry.schema,
                                frontMatter: document.frontMatter,
                                body: document.body,
                                explicitValues: parsedInputs.explicit,
                                defaultKeys: parsedInputs.defaultKeys,
                                configDefaults,
                        });

                        if (!updateResult.changed) {
                                continue;
                        }

                        await fs.writeFile(filePath, updateResult.content, "utf8");
                        updated.push(filePath);
                } catch (error) {
                        const messages = normalizeErrorMessages(error);
                        skipped.push({ filePath, messages });
                }
        }

        return { updated, skipped };
}

async function updateDocument(params: {
        schema: z.ZodTypeAny;
        frontMatter: Record<string, unknown>;
        body: string;
        explicitValues: Record<string, unknown>;
        defaultKeys: Set<string>;
        configDefaults: Record<string, unknown>;
}): Promise<{ changed: boolean; content: string }> {
        const { schema, frontMatter, body, explicitValues, defaultKeys, configDefaults } =
                params;

        const explicitEntries = Object.entries(explicitValues);
        const requestedDefaultKeys = Array.from(defaultKeys);

        const initialFrontMatter: Record<string, unknown> = { ...frontMatter };
        for (const [key, value] of explicitEntries) {
                initialFrontMatter[key] = value;
        }

        if (explicitEntries.length === 0 && requestedDefaultKeys.length === 0) {
                return { changed: false, content: serializeMarkdownDocument(frontMatter, body) };
        }

        const candidateForDefaults = { ...initialFrontMatter };
        for (const key of requestedDefaultKeys) {
                delete candidateForDefaults[key];
        }

        const defaultsFromConfig = new Map<string, unknown>();
        for (const key of requestedDefaultKeys) {
                if (Object.prototype.hasOwnProperty.call(configDefaults, key)) {
                        defaultsFromConfig.set(key, configDefaults[key]);
                }
        }

        const schemaDefaults = await resolveSchemaDefaults({
                schema,
                candidate: candidateForDefaults,
                missingKeys: requestedDefaultKeys.filter((key) => !defaultsFromConfig.has(key)),
        });

        const finalFrontMatter: Record<string, unknown> = { ...initialFrontMatter };
        let didChange = false;

        for (const [key, value] of explicitEntries) {
                if (!isDeepEqual(frontMatter[key], value)) {
                        didChange = true;
                }
                finalFrontMatter[key] = value;
        }

        for (const key of requestedDefaultKeys) {
                const defaultValue = defaultsFromConfig.has(key)
                        ? defaultsFromConfig.get(key)
                        : schemaDefaults.get(key);
                if (defaultValue === undefined) {
                        throw new MarkdfmError(
                                "DEFAULT_VALUE_UNAVAILABLE",
                                `No default value available for ${key}`,
                        );
                }
                if (!isDeepEqual(frontMatter[key], defaultValue)) {
                        didChange = true;
                }
                finalFrontMatter[key] = defaultValue;
        }

        if (!didChange) {
                return { changed: false, content: serializeMarkdownDocument(frontMatter, body) };
        }

        await assertValidFrontMatter(schema, finalFrontMatter);

        const serialized = serializeMarkdownDocument(finalFrontMatter, body);
        return { changed: true, content: serialized };
}

function parseUpdateInputs(inputs: string[]): ParsedUpdateInputs {
        const explicitInputs: string[] = [];
        const defaultKeys = new Set<string>();

        for (const raw of inputs) {
                if (raw.includes("=")) {
                        explicitInputs.push(raw);
                        continue;
                }

                const key = raw.trim();
                if (!key) {
                        throw new MarkdfmError(
                                "INVALID_UPDATE_INPUT",
                                "Front matter key cannot be empty",
                        );
                }

                if (defaultKeys.has(key)) {
                        continue;
                }

                defaultKeys.add(key);
        }

        const explicit = parseFrontMatterInputs(explicitInputs);
        for (const key of Object.keys(explicit)) {
                if (defaultKeys.has(key)) {
                        throw new MarkdfmError(
                                "INVALID_UPDATE_INPUT",
                                `Duplicate front matter override for ${key}`,
                        );
                }
        }

        return { explicit, defaultKeys };
}

async function resolveSchemaDefaults(params: {
        schema: z.ZodTypeAny;
        candidate: Record<string, unknown>;
        missingKeys: string[];
}): Promise<Map<string, unknown>> {
        if (params.missingKeys.length === 0) {
                return new Map();
        }

        const parseResult = await params.schema.safeParseAsync(params.candidate);
        if (!parseResult.success) {
                const missing = extractMissingKeys(parseResult.error, new Set(params.missingKeys));
                if (missing.length > 0 && missing.length === parseResult.error.issues.length) {
                        const list = missing.join(", ");
                        throw new MarkdfmError(
                                "DEFAULT_VALUE_UNAVAILABLE",
                                `No default value available for ${list}`,
                        );
                }
                const message = parseResult.error.message;
                throw new MarkdfmError("SCHEMA_VALIDATION", message);
        }

        const defaults = new Map<string, unknown>();
        for (const key of params.missingKeys) {
                if (Object.prototype.hasOwnProperty.call(parseResult.data, key)) {
                        defaults.set(key, (parseResult.data as Record<string, unknown>)[key]);
                }
        }
        return defaults;
}

async function assertValidFrontMatter(
        schema: z.ZodTypeAny,
        value: Record<string, unknown>,
): Promise<void> {
        const result = await schema.safeParseAsync(value);
        if (!result.success) {
                throw new MarkdfmError("SCHEMA_VALIDATION", result.error.message);
        }
}

function extractMissingKeys(error: z.ZodError, targets: Set<string>): string[] {
        const missing = new Set<string>();
        for (const issue of error.issues) {
                const path = issue.path.join(".");
                if (targets.has(path)) {
                        missing.add(path || "(root)");
                }
        }
        return [...missing];
}

function normalizeErrorMessages(error: unknown): string[] {
        if (error instanceof MarkdfmError) {
                return [error.message];
        }
        if (error instanceof Error) {
                return [error.message];
        }
        return [String(error)];
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
                if (!result) {
                        return {};
                }
                return { ...(result as Record<string, unknown>) };
        }

        return { ...(value as Record<string, unknown>) };
}

function isDeepEqual(a: unknown, b: unknown): boolean {
        if (Object.is(a, b)) {
                return true;
        }

        if (typeof a !== typeof b) {
                return false;
        }

        if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) {
                        return false;
                }
                return a.every((value, index) => isDeepEqual(value, b[index]));
        }

        if (isPlainObject(a) && isPlainObject(b)) {
                const keysA = Object.keys(a);
                const keysB = Object.keys(b);
                if (keysA.length !== keysB.length) {
                        return false;
                }
                return keysA.every((key) =>
                        Object.prototype.hasOwnProperty.call(b, key) &&
                        isDeepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
                );
        }

        return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
        return (
                typeof value === "object" &&
                value !== null &&
                (value as Record<string, unknown>).constructor === Object
        );
}
