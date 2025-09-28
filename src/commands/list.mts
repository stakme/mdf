import path from "node:path";
import { loadConfig } from "../config.mts";
import { MarkdfmError } from "../errors.mts";
import { readMarkdownDocument } from "../front-matter.mts";
import { collectMarkdownFiles, normalizeExtension } from "../utils/files.mts";

export interface ListCommandOptions {
        cwd: string;
        directory: string;
}

export interface ListCommandResult {
        tree: string[];
}

interface VirtualPathEntry {
        segments: readonly string[];
        fileName: string;
}

interface DirectoryNode {
        type: "dir";
        name: string;
        children: TreeNode[];
        directories: Map<string, DirectoryNode>;
}

interface FileNode {
        type: "file";
        name: string;
}

type TreeNode = DirectoryNode | FileNode;

export async function runListCommand(
        options: ListCommandOptions,
): Promise<ListCommandResult> {
        const resolvedDirectory = path.resolve(options.cwd, options.directory);
        const config = await loadConfig(options.cwd);
        if (!config) {
                throw new MarkdfmError(
                        "CONFIG_NOT_FOUND",
                        "Could not find a markdfm config file. Create one at .config/markdfm.mts",
                );
        }

        if (!config.virtualPath) {
                throw new MarkdfmError(
                        "VIRTUAL_PATH_NOT_CONFIGURED",
                        `Virtual path configuration not found in ${formatDisplayPath(config.path, options.cwd)}. Define virtualPath.param in the config file.`,
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

        const entries: VirtualPathEntry[] = [];
        for (const filePath of files) {
                const document = await readMarkdownDocument(filePath);
                const rawVirtualPath = document.frontMatter[config.virtualPath.param];

                let segments: string[];
                if (rawVirtualPath === undefined || rawVirtualPath === null) {
                        segments = [];
                } else if (typeof rawVirtualPath === "string") {
                        segments = splitVirtualPath(rawVirtualPath, config.virtualPath.separator);
                } else {
                        throw new MarkdfmError(
                                "INVALID_VIRTUAL_PATH_VALUE",
                                `Front matter field "${config.virtualPath.param}" must be a string in ${formatDisplayPath(filePath, options.cwd)}`,
                        );
                }

                const fileName = path.basename(filePath);
                entries.push({ segments, fileName });
        }

        const tree = buildTree(entries);
        return { tree };
}

function splitVirtualPath(value: string, separator: string): string[] {
        const normalized = value.trim();
        if (!normalized) {
                return [];
        }

        return normalized
                .split(separator)
                .map((segment) => segment.trim())
                .filter((segment) => segment.length > 0);
}

function buildTree(entries: VirtualPathEntry[]): string[] {
        const root: DirectoryNode = {
                type: "dir",
                name: "",
                children: [],
                directories: new Map(),
        };

        for (const entry of entries) {
                let current = root;
                for (const segment of entry.segments) {
                        let next = current.directories.get(segment);
                        if (!next) {
                                next = {
                                        type: "dir",
                                        name: segment,
                                        children: [],
                                        directories: new Map(),
                                };
                                current.directories.set(segment, next);
                                current.children.push(next);
                        }
                        current = next;
                }

                const fileNode: FileNode = { type: "file", name: entry.fileName };
                current.children.push(fileNode);
        }

        return formatTree(root);
}

function formatTree(root: DirectoryNode): string[] {
        const lines: string[] = [];
        const children = sortNodes(root.children);
        children.forEach((child, index) => {
                appendNode(child, "", index === children.length - 1, lines);
        });
        return lines;
}

function appendNode(node: TreeNode, prefix: string, isLast: boolean, lines: string[]): void {
        const connector = isLast ? "└── " : "├── ";
        lines.push(`${prefix}${connector}${node.name}`);

        if (node.type === "dir") {
                const nextPrefix = prefix + (isLast ? "    " : "│   ");
                const children = sortNodes(node.children);
                children.forEach((child, index) => {
                        appendNode(child, nextPrefix, index === children.length - 1, lines);
                });
        }
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
        return [...nodes].sort((a, b) => {
                if (a.type !== b.type) {
                        return a.type === "dir" ? -1 : 1;
                }
                return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
}

function formatDisplayPath(filePath: string, cwd: string): string {
        const relative = path.relative(cwd, filePath) || path.basename(filePath);
        if (relative.startsWith("..")) {
                return relative;
        }
        return relative.startsWith(".") ? relative : `./${relative}`;
}
