import { describe, expect, it } from "vitest";
import { buildNavigationTree } from "../src/viewer/navigation.mts";
import type { ViewerDocument } from "../src/viewer/types.mts";

describe("buildNavigationTree", () => {
	it("orders directories according to document sort order", () => {
		const documents = [
			mockDocument({
				id: "overview",
				title: "Docs Overview",
				navigationSegments: ["Docs Overview"],
				chapter: 1,
			}),
			mockDocument({
				id: "filters",
				title: "Filters and Virtual Paths",
				navigationSegments: ["cli", "Filters and Virtual Paths"],
				chapter: 5,
			}),
			mockDocument({
				id: "configuration",
				title: "Configuration Guide",
				navigationSegments: ["Configuration Guide"],
				chapter: 3,
			}),
			mockDocument({
				id: "recipes",
				title: "Everyday Recipes",
				navigationSegments: ["recipes", "Everyday Recipes"],
				chapter: 6,
			}),
			mockDocument({
				id: "cli-reference",
				title: "CLI Reference",
				navigationSegments: ["cli", "CLI Reference"],
				chapter: 4,
			}),
			mockDocument({
				id: "getting-started",
				title: "Getting Started",
				navigationSegments: ["Getting Started"],
				chapter: 2,
			}),
			mockDocument({
				id: "changelog",
				title: "Change logs",
				navigationSegments: ["Change logs"],
				chapter: 7,
			}),
		];

		const navigation = buildNavigationTree(documents, (a, b) => {
			const aChapter = Number(a.frontMatter.chapter ?? 0);
			const bChapter = Number(b.frontMatter.chapter ?? 0);
			return aChapter - bChapter;
		});
		expect(navigation).toEqual({
			type: "dir",
			name: "",
			children: [
				{
					type: "file",
					name: "Docs Overview",
					documentId: "overview",
					routePath: "Docs Overview",
				},
				{
					type: "file",
					name: "Getting Started",
					documentId: "getting-started",
					routePath: "Getting Started",
				},
				{
					type: "file",
					name: "Configuration Guide",
					documentId: "configuration",
					routePath: "Configuration Guide",
				},
				{
					type: "dir",
					name: "cli",
					children: [
						{
							type: "file",
							name: "CLI Reference",
							documentId: "cli-reference",
							routePath: "cli/CLI Reference",
						},
						{
							type: "file",
							name: "Filters and Virtual Paths",
							documentId: "filters",
							routePath: "cli/Filters and Virtual Paths",
						},
					],
				},
				{
					type: "dir",
					name: "recipes",
					children: [
						{
							type: "file",
							name: "Everyday Recipes",
							documentId: "recipes",
							routePath: "recipes/Everyday Recipes",
						},
					],
				},
				{
					type: "file",
					name: "Change logs",
					documentId: "changelog",
					routePath: "Change logs",
				},
			],
		});
	});
});

interface MockDocumentOptions {
	id: string;
	title: string;
	navigationSegments: string[];
	chapter: number;
}

function mockDocument(options: MockDocumentOptions): ViewerDocument {
	return {
		id: options.id,
		filePath: `/docs/${options.id}.md`,
		displayPath: options.id,
		relativePath: options.id,
		slug: options.id,
		meta: {
			title: options.title,
			description: null,
			tags: [],
			author: null,
			createdAt: null,
			updatedAt: null,
			virtualPath: options.navigationSegments.join("/"),
			routePath: options.navigationSegments.join("/"),
			draft: false,
		},
		frontMatter: {
			chapter: options.chapter,
		},
		html: "",
		markdown: "",
		virtualPathSegments: [...options.navigationSegments],
		navigationSegments: [...options.navigationSegments],
	};
}
