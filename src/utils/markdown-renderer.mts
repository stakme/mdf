import hljs from "highlight.js/lib/common";
import type { TokensList } from "marked";
import { marked } from "marked";

const HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	ts: "typescript",
	tsx: "typescript",
	sh: "shell",
	bash: "shell",
	zsh: "shell",
	ps1: "powershell",
	ps: "powershell",
	yml: "yaml",
};

function resolveHighlightLanguage(
	language: string | undefined,
): string | undefined {
	if (!language) {
		return undefined;
	}

	const normalized = language.trim().toLowerCase();
	if (!normalized) {
		return undefined;
	}

	return HIGHLIGHT_LANGUAGE_ALIASES[normalized] ?? normalized;
}

const renderer = new marked.Renderer();

renderer.code = ({
	text,
	lang,
}: {
	text: string;
	lang?: string | null;
}): string => {
	const resolved = resolveHighlightLanguage(lang ?? undefined);
	const highlightLanguage =
		resolved && hljs.getLanguage(resolved) ? resolved : undefined;
	const highlighted = highlightLanguage
		? hljs.highlight(text, { language: highlightLanguage }).value
		: hljs.highlightAuto(text).value;
	const languageClass = buildLanguageClass(lang, highlightLanguage);
	return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>\n`;
};

marked.use({ renderer });

function buildLanguageClass(
	original: string | null | undefined,
	canonical: string | undefined,
): string {
	const classes: string[] = [];
	const push = (value: string | null | undefined) => {
		const sanitized = sanitizeLanguageValue(value);
		if (sanitized && !classes.includes(sanitized)) {
			classes.push(sanitized);
		}
	};

	push(original);
	push(canonical);

	if (classes.length === 0) {
		return "";
	}

	return classes.map((entry) => ` language-${entry}`).join("");
}

function sanitizeLanguageValue(
	value: string | null | undefined,
): string | null {
	if (!value) {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	if (!normalized) {
		return null;
	}

	const sanitized = normalized.replace(/[^\da-z+\-#]+/gu, "");
	if (!sanitized) {
		return null;
	}

	return sanitized;
}

export interface RenderDocumentMarkdownOptions {
	assetBaseUrl?: string;
}

export interface MarkdownDocumentAssetReference {
	originalPath: string;
	encodedPath: string;
	suffix: string;
}

export interface RenderDocumentMarkdownResult {
	html: string;
	assets: MarkdownDocumentAssetReference[];
}

export function renderDocumentMarkdown(
	markdown: string,
	title: string | null,
	options: RenderDocumentMarkdownOptions = {},
): string {
	return renderDocumentMarkdownWithAssets(markdown, title, options).html;
}

export function renderDocumentMarkdownWithAssets(
	markdown: string,
	title: string | null,
	options: RenderDocumentMarkdownOptions = {},
): RenderDocumentMarkdownResult {
	const tokens = marked.lexer(markdown);
	stripLeadingTitleHeading(tokens, title);
	const assets: MarkdownDocumentAssetReference[] = [];
	if (options.assetBaseUrl) {
		rewriteDocumentAssetTokens(tokens, options.assetBaseUrl, (reference) => {
			assets.push(reference);
		});
	}
	const rendered = marked.parser(tokens);
	const html = typeof rendered === "string" ? rendered : String(rendered);
	return { html, assets };
}

function rewriteDocumentAssetTokens(
	tokens: TokensList,
	assetBaseUrl: string,
	collect?: (reference: MarkdownDocumentAssetReference) => void,
): void {
	marked.walkTokens(tokens, (token) => {
		if (token.type === "image") {
			token.href = rewriteRelativeAssetHref(token.href, assetBaseUrl, collect);
		}
	});
}

function rewriteRelativeAssetHref(
	href: string | null | undefined,
	baseUrl: string,
	collect?: (reference: MarkdownDocumentAssetReference) => void,
): string {
	if (href === null || href === undefined) {
		return "";
	}

	const trimmed = href.trim();
	if (!trimmed) {
		return trimmed;
	}

	if (trimmed.startsWith("#")) {
		return trimmed;
	}

	if (trimmed.startsWith("//")) {
		return trimmed;
	}

	if (trimmed.startsWith("/")) {
		return trimmed;
	}

	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/u.test(trimmed)) {
		return trimmed;
	}

	const { path: pathPart, suffix } = splitHref(trimmed);
	const encodedSegments: string[] = [];
	for (const segment of pathPart.split("/")) {
		if (!segment || segment === ".") {
			continue;
		}

		if (segment === "..") {
			encodedSegments.push(segment);
			continue;
		}

		encodedSegments.push(encodeURIComponent(segment));
	}

	const encodedPath = encodedSegments.join("/");
	if (collect && encodedPath) {
		collect({ originalPath: pathPart, encodedPath, suffix });
	}
	return `${baseUrl}${encodedPath}${suffix}`;
}

function splitHref(value: string): { path: string; suffix: string } {
	let pathPart = value;
	let suffix = "";

	const hashIndex = pathPart.indexOf("#");
	if (hashIndex >= 0) {
		suffix = pathPart.slice(hashIndex);
		pathPart = pathPart.slice(0, hashIndex);
	}

	const queryIndex = pathPart.indexOf("?");
	if (queryIndex >= 0) {
		suffix = pathPart.slice(queryIndex) + suffix;
		pathPart = pathPart.slice(0, queryIndex);
	}

	return { path: pathPart, suffix };
}

function stripLeadingTitleHeading(
	tokens: TokensList,
	title: string | null,
): void {
	const normalizedTitle = normalizeHeadingComparisonValue(title);
	if (!normalizedTitle) {
		return;
	}

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token) {
			break;
		}

		if (token.type === "space") {
			continue;
		}

		if (token.type === "heading" && token.depth === 1) {
			const normalizedHeading = normalizeHeadingComparisonValue(token.text);
			if (normalizedHeading === normalizedTitle) {
				tokens.splice(index, 1);
				removeLeadingSpaceTokens(tokens, index);
			}
		}

		break;
	}
}

function removeLeadingSpaceTokens(
	tokens: TokensList,
	startIndex: number,
): void {
	while (startIndex < tokens.length && tokens[startIndex]?.type === "space") {
		tokens.splice(startIndex, 1);
	}
}

function normalizeHeadingComparisonValue(
	value: string | null | undefined,
): string | null {
	if (!value) {
		return null;
	}

	const collapsed = value.replace(/\s+/gu, " ").trim();
	if (!collapsed) {
		return null;
	}

	return collapsed.toLowerCase();
}
