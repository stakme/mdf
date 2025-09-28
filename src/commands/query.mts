import path from "node:path";
import { loadConfig } from "../config.mts";
import { MarkdfmError } from "../errors.mts";
import { readMarkdownDocument } from "../front-matter.mts";
import { collectMarkdownFiles, normalizeExtension } from "../utils/files.mts";
import {
        matchesParsedFilter,
        parseFilterExpression,
        resolveFilterPath,
} from "../utils/filters.mts";

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
        const files = await collectMarkdownFiles(resolvedDirectory, extension);
        if (!files.length) {
                throw new MarkdfmError(
                        "NO_MATCHING_FILES",
                        `No files with extension ${extension} found in ${resolvedDirectory}`,
                );
        }

        const parsedFilters = options.filters.map(parseFilterExpression);
        const template = options.format ?? "{{title}}";
        const matches: QueryMatch[] = [];

        for (const filePath of files) {
                const document = await readMarkdownDocument(filePath);
                if (!parsedFilters.every((filter) => matchesParsedFilter(document.frontMatter, filter))) {
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
        return resolveFilterPath(frontMatter, segments);
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
