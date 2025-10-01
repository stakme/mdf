import type {
	ViewerContextPayload,
	ViewerDocumentPayload,
	ViewerFrontMatterFieldPayload,
	ViewerNavigationDirectory,
	ViewerNavigationNode,
} from "@stakme/mdf/viewer-types";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

interface NavigationProps {
	navigation: ViewerNavigationDirectory;
	selectedId: string | null;
	onSelect(id: string): void;
}

interface NavigationNodeProps {
	node: ViewerNavigationNode;
	selectedId: string | null;
	onSelect(id: string): void;
	depth: number;
	path: string;
}

interface FrontMatterPanelProps {
	fields: ViewerFrontMatterFieldPayload[];
	onSelectDocument(id: string): void;
}

function isDirectoryContainsId(
	node: ViewerNavigationDirectory,
	id: string,
): boolean {
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

async function fetchJson<T>(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(input, init);
	if (!response.ok) {
		let message = `${response.status} ${response.statusText}`;
		try {
			const problem = await response.json();
			if (typeof problem?.error === "string") {
				message = problem.error;
			}
		} catch {
			// ignore JSON parsing errors
		}
		throw new Error(message);
	}

	return (await response.json()) as T;
}

function NavigationTree({ navigation, selectedId, onSelect }: NavigationProps) {
	if (!navigation.children.length) {
		return (
			<p className="text-sm text-slate-400">
				No documents matched the current filters.
			</p>
		);
	}

	return (
		<ul className="space-y-1">
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

function NavigationNode({
	node,
	selectedId,
	onSelect,
	depth,
	path,
}: NavigationNodeProps) {
	if (node.type === "file") {
		const isActive = node.documentId === selectedId;
		return (
			<li>
				<button
					type="button"
					onClick={() => onSelect(node.documentId)}
					className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
						isActive
							? "bg-sky-500/90 text-white shadow"
							: "text-slate-300 hover:bg-slate-800 hover:text-white"
					}`}
				>
					<span className="truncate">{node.name}</span>
					<span className="text-xs text-slate-400">{node.routePath}</span>
				</button>
			</li>
		);
	}

	const currentPath = node.name ? `${path}/${node.name}` : path;
	const containsSelected = selectedId
		? isDirectoryContainsId(node, selectedId)
		: false;
	const hasChildren = node.children.length > 0;

	return (
		<li>
			<details className="group" open={containsSelected || depth === 0}>
				<summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
					<span className="truncate">
						{node.name || (depth === 0 ? "Documents" : "(untitled)")}
					</span>
					<span className="text-xs text-slate-500">{currentPath || "/"}</span>
				</summary>
				<div className="mt-1 border-l border-slate-800 pl-3">
					{hasChildren ? (
						<ul className="space-y-1">
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
						<p className="px-2 py-2 text-xs text-slate-500">
							No documents in this directory.
						</p>
					)}
				</div>
			</details>
		</li>
	);
}

function NavigationSelect({
	context,
	selectedId,
	onSelect,
}: {
	context: ViewerContextPayload;
	selectedId: string | null;
	onSelect(id: string): void;
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
						onSelect(value);
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

function FrontMatterPanel({ fields, onSelectDocument }: FrontMatterPanelProps) {
	if (!fields.length) {
		return (
			<p className="text-sm text-slate-400">
				No linkable front matter fields available.
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{fields.map((field) => (
				<details
					key={field.name}
					className="rounded-md border border-slate-800 bg-slate-900/60"
				>
					<summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-200">
						{field.name}
					</summary>
					<div className="space-y-3 px-3 pb-3 pt-2 text-sm">
						{field.values.map((value) => (
							<div
								key={value.value}
								className="rounded-md border border-slate-800 bg-slate-900/70 p-2"
							>
								<div className="flex items-center justify-between">
									<span className="font-medium text-slate-100">
										{value.value}
									</span>
									<span className="text-xs text-slate-400">
										{value.documentCount === 1
											? "1 document"
											: `${value.documentCount} documents`}
									</span>
								</div>
								<div className="mt-2 space-y-1 text-xs">
									{value.documents.map((doc) => (
										<button
											key={doc.id}
											type="button"
											onClick={() => onSelectDocument(doc.id)}
											className="w-full truncate rounded px-2 py-1 text-left text-slate-300 transition hover:bg-slate-800 hover:text-white"
										>
											{doc.meta.title || doc.displayPath}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				</details>
			))}
		</div>
	);
}

function DocumentFrontMatter({
	document,
}: {
	document: ViewerDocumentPayload;
}) {
	const entries = useMemo(() => {
		return Object.entries(document.frontMatter ?? {})
			.filter(([key]) => key !== "title")
			.sort((a, b) =>
				a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
			);
	}, [document.frontMatter]);

	if (!entries.length) {
		return (
			<p className="text-sm text-slate-400">
				This document has no additional front matter.
			</p>
		);
	}

	return (
		<dl className="space-y-3">
			{entries.map(([key, value]) => (
				<div
					key={key}
					className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
				>
					<dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
						{key}
					</dt>
					<dd className="mt-1 text-sm text-slate-100">
						{renderFrontMatterValue(value)}
					</dd>
				</div>
			))}
		</dl>
	);
}

function renderFrontMatterValue(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map(renderFrontMatterValue).join(", ");
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (value === null || value === undefined) {
		return "—";
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

export default function App(): JSX.Element {
	const [context, setContext] = useState<ViewerContextPayload | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [document, setDocument] = useState<ViewerDocumentPayload | null>(null);
	const [loadingDocument, setLoadingDocument] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const selectedIdRef = useRef<string | null>(null);
	const fetchDocumentRequestId = useRef(0);

	const fetchContext = useCallback(
		async (
			preserveSelection: boolean,
		): Promise<ViewerContextPayload | null> => {
			try {
				const payload = await fetchJson<ViewerContextPayload>("/api/context");
				setContext(payload);
				setError(null);
				setSelectedId((previous) => {
					if (preserveSelection && previous) {
						const exists = payload.documents.some(
							(entry) => entry.id === previous,
						);
						if (exists) {
							return previous;
						}
					}
					return payload.defaultDocumentId;
				});
				return payload;
			} catch (fetchError) {
				setError(
					fetchError instanceof Error ? fetchError.message : String(fetchError),
				);
				return null;
			}
		},
		[],
	);

	useEffect(() => {
		void fetchContext(false);
	}, [fetchContext]);

	useEffect(() => {
		selectedIdRef.current = selectedId;
	}, [selectedId]);

	const fetchDocument = useCallback(async (id: string) => {
		const requestId = ++fetchDocumentRequestId.current;
		setLoadingDocument(true);
		setError(null);

		try {
			const payload = await fetchJson<ViewerDocumentPayload>(
				`/api/documents/${encodeURIComponent(id)}`,
			);
			if (fetchDocumentRequestId.current === requestId) {
				setDocument(payload);
			}
		} catch (fetchError) {
			if (fetchDocumentRequestId.current === requestId) {
				setError(
					fetchError instanceof Error ? fetchError.message : String(fetchError),
				);
				setDocument(null);
			}
		} finally {
			if (fetchDocumentRequestId.current === requestId) {
				setLoadingDocument(false);
			}
		}
	}, []);

	useEffect(() => {
		if (!selectedId) {
			setDocument(null);
			return;
		}

		void fetchDocument(selectedId);
	}, [selectedId, fetchDocument]);

	useEffect(() => {
		const source = new EventSource("/events");
		const handleReload = () => {
			void fetchContext(true).then((payload) => {
				const currentId = selectedIdRef.current;
				if (!currentId) {
					return;
				}

				const documentExists = payload?.documents.some(
					(entry) => entry.id === currentId,
				);

				if (documentExists) {
					void fetchDocument(currentId);
				}
			});
		};
		source.addEventListener("reload", handleReload);
		return () => {
			source.removeEventListener("reload", handleReload);
			source.close();
		};
	}, [fetchContext, fetchDocument]);

	const activeDocument = document;
	const headerOptions = context?.headerOptions ?? [];
	const warnings = context?.warnings ?? [];

	return (
		<div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
			<header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
					<div>
						<h1 className="text-xl font-semibold">mdf viewer</h1>
						{context?.directoryLabel ? (
							<p className="text-sm text-slate-400">{context.directoryLabel}</p>
						) : null}
					</div>
					<div className="flex flex-wrap gap-2 text-xs text-slate-300">
						{headerOptions.map((option) => (
							<span
								key={`${option.label}-${option.value}`}
								className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1"
							>
								<span className="font-semibold uppercase tracking-wide text-slate-400">
									{option.label}
								</span>
								<span className="font-mono">{option.value}</span>
							</span>
						))}
					</div>
				</div>
			</header>
			<div className="flex flex-1 flex-col md:flex-row">
				<aside className="border-b border-slate-800 bg-slate-900/60 px-4 py-6 md:sticky md:top-0 md:h-screen md:w-72 md:border-b-0 md:border-r md:overflow-y-auto">
					{context ? (
						<>
							<NavigationSelect
								context={context}
								selectedId={selectedId}
								onSelect={setSelectedId}
							/>
							<div className="hidden md:block">
								<NavigationTree
									navigation={context.navigation}
									selectedId={selectedId}
									onSelect={setSelectedId}
								/>
							</div>
						</>
					) : (
						<p className="text-sm text-slate-400">Loading documents…</p>
					)}
				</aside>
				<main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
					{warnings.length > 0 ? (
						<div className="mb-6 space-y-3 rounded-md border border-yellow-700 bg-yellow-500/10 p-4 text-sm text-yellow-200">
							<p className="font-semibold uppercase tracking-wide">
								{warnings.length === 1
									? "1 warning detected"
									: `${warnings.length} warnings detected`}
							</p>
							<ul className="space-y-2">
								{warnings.map((warning) => (
									<li key={warning.filePath}>
										<p className="font-medium text-yellow-100">
											{warning.filePath}
										</p>
										<ul className="list-disc pl-5 text-yellow-200/90">
											{warning.messages.map((message, index) => (
												<li key={`${warning.filePath}-${index}`}>{message}</li>
											))}
										</ul>
									</li>
								))}
							</ul>
						</div>
					) : null}
					{error ? (
						<div className="rounded-md border border-red-700 bg-red-500/10 p-4 text-sm text-red-200">
							{error}
						</div>
					) : null}
					{!context ? (
						<p className="text-sm text-slate-400">Preparing viewer context…</p>
					) : null}
					{context && !selectedId ? (
						<p className="text-sm text-slate-400">
							No document selected. Choose one from the navigation.
						</p>
					) : null}
					{loadingDocument ? (
						<p className="text-sm text-slate-400">Loading document…</p>
					) : null}
					{activeDocument ? (
						<article className="mx-auto flex w-full max-w-4xl flex-col gap-8">
							<header className="border-b border-slate-800 pb-4">
								<h2 className="text-3xl font-semibold">
									{activeDocument.meta.title || activeDocument.displayPath}
								</h2>
								{activeDocument.meta.description ? (
									<p className="mt-2 text-base text-slate-300">
										{activeDocument.meta.description}
									</p>
								) : null}
								<div className="mt-2 text-xs text-slate-500">
									<span>{activeDocument.displayPath}</span>
									{activeDocument.meta.routePath ? (
										<span className="ml-2">
											· {activeDocument.meta.routePath}
										</span>
									) : null}
								</div>
							</header>
							<section
								className="prose prose-invert max-w-none"
								// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is generated server-side via trusted markdown parser
								dangerouslySetInnerHTML={{ __html: activeDocument.html }}
							/>
							<section>
								<h3 className="text-xl font-semibold">Front matter</h3>
								<div className="mt-3">
									<DocumentFrontMatter document={activeDocument} />
								</div>
							</section>
						</article>
					) : null}
				</main>
				<aside className="border-t border-slate-800 bg-slate-900/60 px-4 py-6 md:w-80 md:border-t-0 md:border-l md:overflow-y-auto">
					{context ? (
						<FrontMatterPanel
							fields={context.frontMatter}
							onSelectDocument={(id) => {
								setSelectedId(id);
							}}
						/>
					) : null}
				</aside>
			</div>
		</div>
	);
}
