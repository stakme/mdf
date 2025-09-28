import { promises as fs } from "node:fs";
import YAML from "yaml";
import { MarkdfmError } from "./errors.mts";

export interface MarkdownDocument {
        frontMatter: Record<string, unknown>;
        body: string;
        raw: string;
}

const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export async function readMarkdownDocument(filePath: string): Promise<MarkdownDocument> {
        const raw = await fs.readFile(filePath, "utf8");
        const { frontMatter, body } = parseFrontMatter(raw, filePath);
        return { frontMatter, body, raw };
}

export function parseFrontMatter(
        content: string,
        filePath?: string,
): { frontMatter: Record<string, unknown>; body: string } {
        const match = content.match(FRONT_MATTER_PATTERN);
        if (!match) {
                throw new MarkdfmError(
                        "FRONT_MATTER_NOT_FOUND",
                        filePath
                                ? `Front matter not found in ${filePath}`
                                : "Front matter not found in content",
                );
        }

        try {
                const parsed = (YAML.parse(match[1] ?? "") ?? {}) as Record<string, unknown>;
                const body = match[2] ?? "";
                return { frontMatter: parsed, body };
        } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new MarkdfmError(
                        "FRONT_MATTER_PARSE",
                        filePath ? `Failed to parse front matter in ${filePath}: ${message}` : message,
                );
        }
}

export function serializeMarkdownDocument(
        frontMatter: Record<string, unknown>,
        body: string,
): string {
        const frontMatterBlock = YAML.stringify(frontMatter, { lineWidth: 0 }).trimEnd();
        const frontMatterSection = `---\n${frontMatterBlock}\n---\n\n`;
        const normalizedBody = ensureTrailingNewline(body);
        return frontMatterSection + normalizedBody;
}

function ensureTrailingNewline(content: string): string {
        if (!content) {
                return "";
        }
        return content.endsWith("\n") ? content : `${content}\n`;
}
