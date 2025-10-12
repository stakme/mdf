import { describe, expect, it } from "vitest";

import { renderDocumentMarkdown } from "../src/utils/markdown-renderer.mts";

describe("markdown renderer highlighting", () => {
	it("adds GitHub-style highlight classes to fenced code blocks", () => {
		const source = "```ts\nconst answer = 42;\n```";
		const html = renderDocumentMarkdown(source, null);

		expect(html).toContain('class="hljs language-ts language-typescript"');
		expect(html).toMatch(/<span class="hljs-keyword">const<\/span>/u);
		expect(html).toMatch(/<span class="hljs-number">42<\/span>/u);
	});
});
