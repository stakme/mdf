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
					className={`group flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
						isActive
							? "bg-sky-600 text-white shadow-lg shadow-sky-500/20"
							: "text-slate-300 hover:bg-slate-800/70 hover:text-white"
					}`}
				>
					<div className="w-full truncate font-medium">{node.name}</div>
					{node.routePath && (
						<div className={`w-full truncate text-xs ${
							isActive ? "text-sky-100" : "text-slate-500 group-hover:text-slate-400"
						}`}>
							{node.routePath}
						</div>
					)}
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
				<summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-200">
					<svg className="size-4 shrink-0 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
					</svg>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="truncate font-semibold">
							{node.name || (depth === 0 ? "Documents" : "(untitled)")}
						</span>
						{currentPath && (
							<span className="truncate text-xs text-slate-600">{currentPath}</span>
						)}
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
			<div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center">
				<p className="text-sm text-slate-400">
					No front matter fields available.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{fields.map((field) => (
				<div key={field.name} className="rounded-lg border border-slate-800 bg-slate-900/60">
					<div className="border-b border-slate-800 px-4 py-3">
						<h3 className="font-bold text-slate-200">{field.name}</h3>
						<p className="mt-0.5 text-xs text-slate-500">
							{field.values.length} {field.values.length === 1 ? "value" : "values"}
						</p>
					</div>
					<div className="overflow-hidden">
						<table className="w-full text-sm">
							<thead className="border-b border-slate-800 bg-slate-900/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
								<tr>
									<th className="px-4 py-2">Value</th>
									<th className="px-4 py-2 text-right">Count</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-800/50">
								{field.values.map((value) => (
									<tr key={value.value} className="group">
										<td className="px-4 py-2">
											<details className="group/details">
												<summary className="flex cursor-pointer items-center gap-2 text-slate-200 transition-colors hover:text-white">
													<svg className="size-3 shrink-0 text-slate-600 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
													</svg>
													<span className="font-medium">{value.value}</span>
												</summary>
												<div className="ml-5 mt-2 space-y-1">
													{value.documents.map((doc) => (
														<button
															key={doc.id}
															type="button"
															onClick={() => onSelectDocument(doc.id)}
															className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-sky-400"
														>
															<svg className="size-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
																<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
															</svg>
															<span className="truncate">{doc.meta.title || doc.displayPath}</span>
														</button>
													))}
												</div>
											</details>
										</td>
										<td className="px-4 py-2 text-right">
											<span className="inline-flex items-center justify-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
												{value.documentCount}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
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
			<div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center">
				<p className="text-sm text-slate-400">
					This document has no additional front matter.
				</p>
			</div>
		);
	}

	return (
		<dl className="grid gap-4 sm:grid-cols-2">
			{entries.map(([key, value]) => (
				<div
					key={key}
					className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 transition-colors hover:border-slate-700"
				>
					<dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
						{key}
					</dt>
					<dd className="mt-2 text-sm leading-relaxed text-slate-100">
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
			<header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
				<div className="mx-auto flex w-full flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
					<div>
						<h1 className="text-xl font-bold tracking-tight">mdf viewer</h1>
						{context?.directoryLabel ? (
							<p className="mt-0.5 text-sm text-slate-400">{context.directoryLabel}</p>
						) : null}
					</div>
					{headerOptions.length > 0 && (
						<div className="flex flex-wrap gap-2 text-xs">
							{headerOptions.map((option) => (
								<span
									key={`${option.label}-${option.value}`}
									className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 transition-colors hover:border-slate-700"
								>
									<span className="font-semibold uppercase tracking-wider text-slate-500">
										{option.label}
									</span>
									<span className="font-mono text-slate-300">{option.value}</span>
								</span>
							))}
						</div>
					)}
				</div>
			</header>
			<div className="flex flex-1 flex-col md:flex-row">
				<aside className="border-b border-slate-800 bg-slate-900/60 px-4 py-5 md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:w-80 md:border-b-0 md:border-r md:overflow-y-auto">
					{context ? (
						<>
							<NavigationSelect
								context={context}
								selectedId={selectedId}
								onSelect={setSelectedId}
							/>
							<div className="hidden md:block">
								<div className="mb-3 flex items-center justify-between">
									<h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
										Documents
									</h2>
									<span className="text-xs text-slate-600">
										{context.documents.length}
									</span>
								</div>
								<NavigationTree
									navigation={context.navigation}
									selectedId={selectedId}
									onSelect={setSelectedId}
								/>
							</div>
						</>
					) : (
						<div className="flex items-center gap-2 text-sm text-slate-400">
							<svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
							</svg>
							Loading documents…
						</div>
					)}
				</aside>
				<main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
					{warnings.length > 0 && (
						<div className="mb-8 overflow-hidden rounded-lg border border-yellow-700/50 bg-yellow-500/10">
							<div className="border-b border-yellow-700/30 bg-yellow-600/20 px-4 py-3">
								<div className="flex items-center gap-2">
									<svg className="size-5 shrink-0 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
									</svg>
									<p className="font-bold text-yellow-100">
										{warnings.length === 1
											? "1 Warning"
											: `${warnings.length} Warnings`}
									</p>
								</div>
							</div>
							<div className="space-y-3 p-4">
								{warnings.map((warning) => (
									<div key={warning.filePath} className="rounded-md bg-yellow-500/5 p-3">
										<p className="mb-2 font-mono text-sm font-semibold text-yellow-100">
											{warning.filePath}
										</p>
										<ul className="space-y-1 pl-4">
											{warning.messages.map((message, index) => (
												<li key={`${warning.filePath}-${index}`} className="text-sm text-yellow-200/90">
													• {message}
												</li>
											))}
										</ul>
									</div>
								))}
							</div>
						</div>
					)}
					{error && (
						<div className="mb-8 overflow-hidden rounded-lg border border-red-700/50 bg-red-500/10">
							<div className="flex items-center gap-2 border-b border-red-700/30 bg-red-600/20 px-4 py-3">
								<svg className="size-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<p className="font-bold text-red-100">Error</p>
							</div>
							<p className="p-4 text-sm text-red-200">{error}</p>
						</div>
					)}
					{!context && (
						<div className="flex items-center gap-2 text-sm text-slate-400">
							<svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
							</svg>
							Preparing viewer context…
						</div>
					)}
					{context && !selectedId && (
						<div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center">
							<svg className="mx-auto size-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
							<p className="mt-4 text-sm text-slate-400">
								No document selected. Choose one from the navigation.
							</p>
						</div>
					)}
					{loadingDocument && (
						<div className="flex items-center gap-2 text-sm text-slate-400">
							<svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
							</svg>
							Loading document…
						</div>
					)}
					{activeDocument && (
						<article className="mx-auto flex w-full max-w-4xl flex-col gap-10">
							<header className="space-y-3 border-b border-slate-800 pb-6">
								<h2 className="text-3xl font-bold leading-tight tracking-tight text-slate-50 md:text-4xl">
									{activeDocument.meta.title || activeDocument.displayPath}
								</h2>
								{activeDocument.meta.description && (
									<p className="text-lg leading-relaxed text-slate-300">
										{activeDocument.meta.description}
									</p>
								)}
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
									<span className="flex items-center gap-1">
										<svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
										</svg>
										{activeDocument.displayPath}
									</span>
									{activeDocument.meta.routePath && (
										<>
											<span>·</span>
											<span className="flex items-center gap-1">
												<svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
												</svg>
												{activeDocument.meta.routePath}
											</span>
										</>
									)}
								</div>
							</header>
							<section
								className="prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline prose-code:text-slate-200 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800"
								// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is generated server-side via trusted markdown parser
								dangerouslySetInnerHTML={{ __html: activeDocument.html }}
							/>
							<section className="space-y-4 border-t border-slate-800 pt-8">
								<h3 className="text-xl font-bold tracking-tight text-slate-200">
									Front matter
								</h3>
								<DocumentFrontMatter document={activeDocument} />
							</section>
						</article>
					)}
				</main>
				<aside className="border-t border-slate-800 bg-slate-900/60 px-4 py-5 md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:w-96 md:border-t-0 md:border-l md:overflow-y-auto">
					{context && (
						<>
							<div className="mb-4">
								<h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
									Properties
								</h2>
								<p className="mt-1 text-xs text-slate-600">
									Browse documents by property
								</p>
							</div>
							<FrontMatterPanel
								fields={context.frontMatter}
								onSelectDocument={(id) => {
									setSelectedId(id);
								}}
							/>
						</>
					)}
				</aside>
			</div>
		</div>
	);
}
