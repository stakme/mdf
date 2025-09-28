import { MarkdfmError } from "../errors.mts";

export type FilterOperator = "exact" | "loose" | "prefix" | "suffix";

export interface ParsedFilter {
        path: string[];
        value: unknown;
        operator: FilterOperator;
}

export function parseFilterExpression(raw: string): ParsedFilter {
        const match = raw.match(/^(.*?)\s*(=|~=|\^=|\$=|:)\s*(.*)$/u);
        if (!match) {
                throw new MarkdfmError(
                        "INVALID_FILTER_EXPRESSION",
                        `Invalid filter expression: ${raw}`,
                );
        }

        const [, keyPart, operatorPart, valuePart] = match;
        const key = keyPart?.trim();
        if (!key) {
                throw new MarkdfmError(
                        "INVALID_FILTER_EXPRESSION",
                        `Invalid filter expression: ${raw}`,
                );
        }

        const operator = normalizeOperator(operatorPart);
        const value = parseFilterValue(valuePart ?? "");
        return {
                path: key.split(".").map((segment) => segment.trim()).filter(Boolean),
                value,
                operator,
        };
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
                return value.some((entry) => compareValues(entry, filter.value, filter.operator));
        }

        return compareValues(value, filter.value, filter.operator);
}

function normalizeOperator(raw: string): FilterOperator {
        switch (raw) {
                case "=":
                case ":":
                        return "exact";
                case "~=":
                        return "loose";
                case "^=":
                        return "prefix";
                case "$=":
                        return "suffix";
                default:
                        throw new MarkdfmError(
                                "INVALID_FILTER_EXPRESSION",
                                `Unsupported filter operator in expression: ${raw}`,
                        );
        }
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

function compareValues(
        candidate: unknown,
        expected: unknown,
        operator: FilterOperator,
): boolean {
        if (candidate === undefined || candidate === null) {
                return false;
        }

        if (operator === "exact") {
                if (candidate === expected) {
                        return true;
                }

                if (typeof candidate === "string" && typeof expected === "string") {
                        return candidate.toLowerCase() === expected.toLowerCase();
                }

                return false;
        }

        const candidateString = toComparableString(candidate);
        const expectedString = toComparableString(expected);
        if (candidateString === null || expectedString === null) {
                return false;
        }

        const normalizedCandidate = candidateString.toLowerCase();
        const normalizedExpected = expectedString.toLowerCase();

        switch (operator) {
                case "loose":
                        return normalizedCandidate.includes(normalizedExpected);
                case "prefix":
                        return normalizedCandidate.startsWith(normalizedExpected);
                case "suffix":
                        return normalizedCandidate.endsWith(normalizedExpected);
                default:
                        return false;
        }
}

function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
}

function toComparableString(value: unknown): string | null {
        if (value === undefined || value === null) {
                return null;
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
