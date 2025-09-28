import { promises as fs } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.mts";
import { MarkdfmError } from "../errors.mts";
import { readMarkdownDocument } from "../front-matter.mts";

export interface QueryCommandOptions {
        cwd: string;
        directory: string;
        filters: string[];
        format?: string;
}

export interface QueryCommandResult {
        matches: QueryMatch[];
}

export interface QueryMatch {
        filePath: string;
        displayPath: string;
        frontMatter: Record<string, unknown>;
        output: string;
}

interface ParsedFilter {
        path: string[];
        value: unknown;
}

export async function runQueryCommand(
        options: QueryCommandOptions,
): Promise<QueryCommandResult> {
        const resolvedDirectory = path.resolve(options.cwd, options.directory);
        const config = await loadConfig(options.cwd);
        if (!config) {
                throw new MarkdfmError(
                        "CONFIG_NOT_FOUND",
                        "Could not find a markdfm config file. Create one at .config/markdfm.mts",
                );
        }

        const extension = normalizeExtension(config.extension ?? ".md");
        const files = await collectFiles(resolvedDirectory, extension);
        if (!files.length) {
                throw new MarkdfmError(
                        "NO_MATCHING_FILES",
                        `No files with extension ${extension} found in ${resolvedDirectory}`,
                );
        }

        const parsedFilters = options.filters.map(parseFilter);
        const template = options.format ?? "{{title}}";
        const matches: QueryMatch[] = [];

        for (const filePath of files) {
                const document = await readMarkdownDocument(filePath);
                if (!parsedFilters.every((filter) => matchesFilter(document.frontMatter, filter))) {
                        continue;
                }

                const relativePath = formatRelativePath(filePath, options.cwd);
                const displayPath = formatDisplayPath(filePath, options.cwd);
                const output = renderTemplate(template, {
                        frontMatter: document.frontMatter,
                        paths: {
                                absolutePath: filePath,
                                displayPath,
                                filename: path.basename(filePath),
                                relativePath,
                        },
                });
                matches.push({
                        filePath,
                        displayPath,
                        frontMatter: document.frontMatter,
                        output,
                });
        }

        return { matches };
}

function parseFilter(raw: string): ParsedFilter {
        const match = raw.match(/^(.*?)\s*:\s*(.*)$/u);
        if (!match) {
                throw new MarkdfmError(
                        "INVALID_QUERY_FILTER",
                        `Invalid filter expression: ${raw}`,
                );
        }

        const [, keyPart, valuePart] = match;
        const key = keyPart?.trim();
        if (!key) {
                        throw new MarkdfmError(
                                "INVALID_QUERY_FILTER",
                                `Invalid filter expression: ${raw}`,
                        );
        }

        const value = parseFilterValue(valuePart ?? "");
        return { path: key.split("."), value };
}

function parseFilterValue(raw: string): unknown {
        const trimmed = raw.trim();
        if (!trimmed) {
                return "";
        }

        const firstChar = trimmed[0];
        const lastChar = trimmed.at(-1);
        if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
                return trimmed.slice(1, -1);
        }

        if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
                return Number(trimmed);
        }

        if (/^(true|false)$/iu.test(trimmed)) {
                return trimmed.toLowerCase() === "true";
        }

        return trimmed;
}

function matchesFilter(
        frontMatter: Record<string, unknown>,
        filter: ParsedFilter,
): boolean {
        const value = resolvePath(frontMatter, filter.path);
        if (value === undefined) {
                return false;
        }

        if (Array.isArray(value)) {
                return value.some((entry) => compareValues(entry, filter.value));
        }

        return compareValues(value, filter.value);
}

function compareValues(candidate: unknown, expected: unknown): boolean {
        if (candidate === expected) {
                return true;
        }

        if (typeof candidate === "string" && typeof expected === "string") {
                return candidate.toLowerCase() === expected.toLowerCase();
        }

        return false;
}

function resolvePath(source: Record<string, unknown>, pathParts: string[]): unknown {
        let current: unknown = source;
        for (const segment of pathParts) {
                if (!segment) {
                        return undefined;
                }
                if (!isRecord(current)) {
                        return undefined;
                }
                current = current[segment];
        }
        return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
}

function renderTemplate(
        template: string,
        context: {
                frontMatter: Record<string, unknown>;
                paths: {
                        absolutePath: string;
                        displayPath: string;
                        filename: string;
                        relativePath: string;
                };
        },
): string {
        return template.replace(/\{\{\s*([^}]*)\}\}/gu, (_, rawExpression: string) => {
                const { path, separator } = parseTemplateExpression(rawExpression);
                const reservedValue = resolveReservedPath(path, context.paths);
                if (reservedValue !== null) {
                        return reservedValue;
                }

                const value = resolveTemplatePath(context.frontMatter, path);
                if (value === undefined || value === null) {
                        return "";
                }

                if (Array.isArray(value)) {
                        const formatted = value.map(formatValue).filter((entry) => entry !== "");
                        if (!formatted.length) {
                                return "";
                        }
                        return formatted.join(separator ?? ", ");
                }

                return formatValue(value);
        });
}

function resolveReservedPath(
        pathExpression: string,
        paths: {
                absolutePath: string;
                displayPath: string;
                filename: string;
                relativePath: string;
        },
): string | null {
        switch (pathExpression) {
                case "file":
                        return paths.displayPath;
                case "relpath":
                        return paths.relativePath;
                case "abspath":
                        return paths.absolutePath;
                case "filename":
                        return paths.filename;
                default:
                        return null;
        }
}

function resolveTemplatePath(
        frontMatter: Record<string, unknown>,
        expression: string,
): unknown {
        const segments = expression.split(".");
        if (segments[0] === "f" && segments.length > 1) {
                        segments.shift();
        }
        return resolvePath(frontMatter, segments);
}

function parseTemplateExpression(expression: string): { path: string; separator: string | null } {
        const trimmedStart = expression.trimStart();
        const colonIndex = trimmedStart.indexOf(":");
        if (colonIndex === -1) {
                return { path: trimmedStart.trimEnd(), separator: null };
        }
        const path = trimmedStart.slice(0, colonIndex).trimEnd();
        const separator = trimmedStart.slice(colonIndex + 1);
        return { path, separator };
}

function formatValue(value: unknown): string {
        if (value === null || value === undefined) {
                return "";
        }
        if (typeof value === "string") {
                return value;
        }
        if (typeof value === "number" || typeof value === "bigint") {
                return value.toString();
        }
        if (typeof value === "boolean") {
                return value ? "true" : "false";
        }
        if (value instanceof Date) {
                return value.toISOString();
        }
        if (typeof value === "object") {
                try {
                        return JSON.stringify(value);
                } catch {
                        return String(value);
                }
        }
        return String(value);
}

async function collectFiles(directory: string, extension: string): Promise<string[]> {
        const results: string[] = [];
        async function walk(current: string): Promise<void> {
                const entries = await fs.readdir(current, { withFileTypes: true });
                for (const entry of entries) {
                        const fullPath = path.join(current, entry.name);
                        if (entry.isDirectory()) {
                                await walk(fullPath);
                                continue;
                        }
                        if (entry.isFile() && fullPath.endsWith(extension)) {
                                results.push(fullPath);
                        }
                }
        }
        await walk(directory);
        return results.sort();
}

function normalizeExtension(extension: string): string {
        return extension.startsWith(".") ? extension : `.${extension}`;
}

function formatDisplayPath(filePath: string, cwd: string): string {
        const relative = path.relative(cwd, filePath) || path.basename(filePath);
        if (relative.startsWith("..")) {
                return relative;
        }
        return relative.startsWith(".") ? relative : `./${relative}`;
}

function formatRelativePath(filePath: string, cwd: string): string {
        const relative = path.relative(cwd, filePath) || path.basename(filePath);
        return relative;
}
