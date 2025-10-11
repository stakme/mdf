import type {
        ViewerContextPayload,
        ViewerNavigationDirectory,
        ViewerNavigationNode,
} from "@stakme/mdf/viewer-types";
import { useId } from "react";

interface NavigationProps {
        navigation: ViewerNavigationDirectory;
        selectedId: string | null;
        onSelect(id: string, routePath: string): void;
}

interface NavigationNodeProps {
        node: ViewerNavigationNode;
        selectedId: string | null;
        onSelect(id: string, routePath: string): void;
        depth: number;
        path: string;
}

export function NavigationTree({ navigation, selectedId, onSelect }: NavigationProps) {
        if (!navigation.children.length) {
                return (
                        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-center">
                                <p className="text-sm text-slate-400">
                                        No documents matched the current filters.
                                </p>
                        </div>
                );
        }

        return (
                <ul className="space-y-0.5">
                        {navigation.children.map((child, index) => (
                                <NavigationNode
                                        key={`${child.type}-${child.type === "dir" ? child.name : child.documentId}-${index}`}
                                        node={child}
                                        selectedId={selectedId}
                                        onSelect={onSelect}
                                        depth={0}
                                        path=""
                                />
                        ))}
                </ul>
        );
}

function NavigationNode({ node, selectedId, onSelect, depth, path }: NavigationNodeProps) {
        if (node.type === "file") {
                const isActive = node.documentId === selectedId;
                return (
                        <li>
                                <button
                                        type="button"
                                        onClick={() => onSelect(node.documentId, node.routePath)}
                                        className={`group flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                                                isActive
                                                        ? "bg-sky-600 text-white shadow-lg shadow-sky-500/20"
                                                        : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                                        }`}
                                >
                                        <div className="w-full truncate font-medium">{node.name}</div>
                                </button>
                        </li>
                );
        }

        const currentPath = node.name ? `${path}/${node.name}` : path;
        const containsSelected = selectedId ? isDirectoryContainsId(node, selectedId) : false;
        const hasChildren = node.children.length > 0;

        return (
                <li>
                        <details className="group" open={containsSelected || depth === 0}>
                                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-200">
                                        <svg
                                                className="size-4 shrink-0 transition-transform group-open:rotate-90"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                aria-hidden="true"
                                        >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <span className="truncate font-semibold">
                                                        {node.name || (depth === 0 ? "Documents" : "(untitled)")}
                                                </span>
                                        </div>
                                </summary>
                                <div className="mt-1 border-l-2 border-slate-800/50 pl-4">
                                        {hasChildren ? (
                                                <ul className="space-y-0.5">
                                                        {node.children.map((child, index) => (
                                                                <NavigationNode
                                                                        key={`${child.type}-${
                                                                                child.type === "dir" ? child.name : child.documentId
                                                                        }-${currentPath}-${index}`}
                                                                        node={child}
                                                                        selectedId={selectedId}
                                                                        onSelect={onSelect}
                                                                        depth={depth + 1}
                                                                        path={currentPath}
                                                                />
                                                        ))}
                                                </ul>
                                        ) : (
                                                <p className="rounded-md bg-slate-900/50 px-3 py-2 text-xs italic text-slate-500">
                                                        No documents in this directory.
                                                </p>
                                        )}
                                </div>
                        </details>
                </li>
        );
}

export function NavigationSelect({
        context,
        selectedId,
        onSelect,
}: {
        context: ViewerContextPayload;
        selectedId: string | null;
        onSelect(id: string, routePath: string): void;
}) {
        const selectId = useId();

        if (!context.documents.length) {
                return null;
        }

        return (
                <div className="mb-6 block md:hidden">
                        <label className="text-sm font-medium text-slate-300" htmlFor={selectId}>
                                Document
                        </label>
                        <select
                                id={selectId}
                                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                                value={selectedId ?? ""}
                                onChange={(event) => {
                                        const value = event.target.value;
                                        if (value) {
                                                const doc = context.documents.find((entry) => entry.id === value);
                                                if (doc) {
                                                        onSelect(doc.id, doc.meta.routePath);
                                                }
                                        }
                                }}
                        >
                                <option value="" disabled>
                                        Select a document
                                </option>
                                {context.documents.map((doc) => (
                                        <option key={doc.id} value={doc.id}>
                                                {doc.meta.title || doc.displayPath}
                                        </option>
                                ))}
                        </select>
                </div>
        );
}

function isDirectoryContainsId(node: ViewerNavigationDirectory, id: string): boolean {
        for (const child of node.children) {
                if (child.type === "file" && child.documentId === id) {
                        return true;
                }
                if (child.type === "dir" && isDirectoryContainsId(child, id)) {
                        return true;
                }
        }
        return false;
}
