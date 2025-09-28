import { MarkdfmError } from "../errors.mts";

export interface ParsedFilter {
        path: string[];
        value: unknown;
}

export function parseFilterExpression(raw: string): ParsedFilter {
        const match = raw.match(/^(.*?)\s*(?:[:=])\s*(.*)$/u);
        if (!match) {
                throw new MarkdfmError(
                        "INVALID_FILTER_EXPRESSION",
                        `Invalid filter expression: ${raw}`,
                );
        }

        const [, keyPart, valuePart] = match;
        const key = keyPart?.trim();
        if (!key) {
                throw new MarkdfmError(
                        "INVALID_FILTER_EXPRESSION",
                        `Invalid filter expression: ${raw}`,
                );
        }

        const value = parseFilterValue(valuePart ?? "");
        return { path: key.split(".").map((segment) => segment.trim()).filter(Boolean), value };
}

export function matchesParsedFilter(
        frontMatter: Record<string, unknown>,
        filter: ParsedFilter,
): boolean {
        const value = resolveFilterPath(frontMatter, filter.path);
        if (value === undefined) {
                return false;
        }

        if (Array.isArray(value)) {
                return value.some((entry) => compareValues(entry, filter.value));
        }

        return compareValues(value, filter.value);
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

export function resolveFilterPath(
        source: Record<string, unknown>,
        pathParts: readonly string[],
): unknown {
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

function compareValues(candidate: unknown, expected: unknown): boolean {
        if (candidate === expected) {
                return true;
        }

        if (typeof candidate === "string" && typeof expected === "string") {
                return candidate.toLowerCase() === expected.toLowerCase();
        }

        return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
}
