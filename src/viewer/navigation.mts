import type {
	ViewerDocument,
	ViewerNavigationDirectory,
	ViewerNavigationFile,
} from "./types.mts";

interface MutableDirectoryNode {
	type: "dir";
	name: string;
	children: MutableNavigationNode[];
	directories: Map<string, MutableDirectoryNode>;
}

type MutableNavigationNode = MutableDirectoryNode | ViewerNavigationFile;

export function buildNavigationTree(
	documents: readonly ViewerDocument[],
	sort: (a: ViewerDocument, b: ViewerDocument) => number,
): ViewerNavigationDirectory {
	const sorted = sortDocuments(documents, sort);
	const root = createDirectoryNode("");

	for (const document of sorted) {
		let current = root;
		const directories = document.navigationSegments.slice(0, -1);

		for (const segment of directories) {
			let next = current.directories.get(segment);
			if (!next) {
				next = createDirectoryNode(segment);
				current.directories.set(segment, next);
				current.children.push(next);
			}
			current = next;
		}

		const fileNode: ViewerNavigationFile = {
			type: "file",
			name: resolveDocumentLabel(document),
			documentId: document.id,
			routePath: document.meta.routePath,
		};

		current.children.push(fileNode);
	}

	return freezeDirectory(root);
}

function sortDocuments(
	documents: readonly ViewerDocument[],
	sort: (a: ViewerDocument, b: ViewerDocument) => number,
): ViewerDocument[] {
	if (documents.length <= 1) {
		return [...documents];
	}

	return documents
		.map((document, index) => ({ document, index }))
		.sort((a, b) => {
			const result = normalizeSortResult(sort(a.document, b.document));
			if (result !== 0) {
				return result;
			}
			return a.index - b.index;
		})
		.map((entry) => entry.document);
}

function normalizeSortResult(result: unknown): number {
	if (
		typeof result !== "number" ||
		Number.isNaN(result) ||
		!Number.isFinite(result)
	) {
		return 0;
	}
	return result;
}

function resolveDocumentLabel(document: ViewerDocument): string {
	const explicit = document.meta.title?.trim();
	if (explicit) {
		return explicit;
	}

	const segments = document.navigationSegments;
	const tail = segments.at(-1)?.trim();
	if (tail) {
		return tail;
	}

	return document.slug.split("/").pop() ?? document.slug;
}

function createDirectoryNode(name: string): MutableDirectoryNode {
	return {
		type: "dir",
		name,
		children: [],
		directories: new Map(),
	};
}

function freezeDirectory(
	node: MutableDirectoryNode,
): ViewerNavigationDirectory {
	return {
		type: "dir",
		name: node.name,
		children: node.children.map((child) =>
			child.type === "dir" ? freezeDirectory(child) : child,
		),
	};
}
