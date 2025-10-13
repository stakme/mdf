import type {
	ViewerContextPayload,
	ViewerDocumentPayload,
} from "@stakme/mdf/viewer-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	DocumentFrontMatter,
	FrontMatterFieldView,
	FrontMatterValueView,
} from "./components/FrontMatter";
import { NavigationSelect, NavigationTree } from "./components/Navigation";
import { fetchJson } from "./utils/fetchJson";
import { buildDocumentHash, parseRoute, type Route } from "./utils/routes";

function normalizeRoutePath(routePath: string | undefined): string | null {
	if (!routePath) {
		return null;
	}

	const trimmed = routePath.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const withoutSlashes = trimmed.replace(/^\/+|\/+$/gu, "");
	if (withoutSlashes.length === 0) {
		return null;
	}

	return withoutSlashes;
}

function buildMarkdownHref(
	routePath: string | undefined,
	fallbackId: string,
): string {
	const normalized = normalizeRoutePath(routePath);
	if (normalized) {
		const encoded = normalized
			.split("/")
			.map((segment) => encodeURIComponent(segment))
			.join("/");
		if (encoded.length > 0) {
			return `/documents/${encoded}/index.md`;
		}
	}

	return `/documents/${encodeURIComponent(fallbackId)}/index.md`;
}

export default function App(): JSX.Element {
	const [context, setContext] = useState<ViewerContextPayload | null>(null);
	const [route, setRoute] = useState<Route>(parseRoute());
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [document, setDocument] = useState<ViewerDocumentPayload | null>(null);
	const [loadingDocument, setLoadingDocument] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
		"idle",
	);
	const selectedIdRef = useRef<string | null>(null);
	const fetchDocumentRequestId = useRef(0);
	const copyTimeoutRef = useRef<number | null>(null);

	const { documentIdToRoutePath, routePathToDocumentId } = useMemo(() => {
		if (!context) {
			return {
				documentIdToRoutePath: new Map<string, string>(),
				routePathToDocumentId: new Map<string, string>(),
			};
		}

		const idToRoute = new Map<string, string>();
		const routeToId = new Map<string, string>();
		for (const doc of context.documents) {
			idToRoute.set(doc.id, doc.meta.routePath);
			routeToId.set(doc.meta.routePath, doc.id);
		}

		return {
			documentIdToRoutePath: idToRoute,
			routePathToDocumentId: routeToId,
		};
	}, [context]);

	const fetchContext = useCallback(
		async (
			preserveSelection: boolean,
		): Promise<ViewerContextPayload | null> => {
			try {
				const payload = await fetchJson<ViewerContextPayload>(
					"/api/context/index.json",
				);
				setContext(payload);
				setError(null);
				if (
					preserveSelection &&
					selectedIdRef.current &&
					!payload.documents.some((entry) => entry.id === selectedIdRef.current)
				) {
					setSelectedId(null);
				}
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
		const handleHashChange = () => {
			setRoute(parseRoute());
		};
		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	useEffect(() => {
		selectedIdRef.current = selectedId;
	}, [selectedId]);

	useEffect(() => {
		if (!context) {
			return;
		}

		if (route.type !== "document") {
			setSelectedId((previous) => (previous === null ? previous : null));
			return;
		}

		if (route.routePath === null) {
			const defaultId =
				context.defaultDocumentId ?? context.documents[0]?.id ?? null;
			if (!defaultId) {
				setSelectedId((previous) => (previous === null ? previous : null));
				return;
			}

			setSelectedId((previous) =>
				previous === defaultId ? previous : defaultId,
			);

			const defaultRoutePath = documentIdToRoutePath.get(defaultId);
			if (defaultRoutePath) {
				const desiredHash = buildDocumentHash(defaultRoutePath);
				if (window.location.hash !== desiredHash) {
					window.location.hash = desiredHash;
				}
			}
			return;
		}

		const targetId = routePathToDocumentId.get(route.routePath);
		if (targetId) {
			setSelectedId((previous) =>
				previous === targetId ? previous : targetId,
			);
			return;
		}

		setSelectedId((previous) => (previous === null ? previous : null));
	}, [context, route, documentIdToRoutePath, routePathToDocumentId]);

	const fetchDocument = useCallback(async (id: string) => {
		const requestId = ++fetchDocumentRequestId.current;
		setLoadingDocument(true);
		setError(null);

		try {
			const payload = await fetchJson<ViewerDocumentPayload>(
				`/api/documents/${encodeURIComponent(id)}/index.json`,
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

	const handleSelectDocument = useCallback((id: string, routePath: string) => {
		const normalizedRoute = routePath?.trim().length ? routePath : id;
		const nextHash = buildDocumentHash(normalizedRoute);

		if (window.location.hash !== nextHash) {
			window.location.hash = nextHash;
		} else {
			setSelectedId((previous) => (previous === id ? previous : id));
		}
	}, []);

	const handleCopyLink = async (): Promise<void> => {
		if (copyTimeoutRef.current !== null) {
			window.clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = null;
		}

		const url = window.location.href;

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(url);
			} else {
				const textarea = document.createElement("textarea");
				textarea.value = url;
				textarea.setAttribute("readonly", "");
				textarea.style.position = "fixed";
				textarea.style.left = "-9999px";
				document.body.appendChild(textarea);
				textarea.select();
				const succeeded = document.execCommand("copy");
				document.body.removeChild(textarea);
				if (!succeeded) {
					throw new Error("Copy command unavailable");
				}
			}
			setCopyStatus("copied");
		} catch {
			setCopyStatus("error");
		}

		copyTimeoutRef.current = window.setTimeout(() => {
			setCopyStatus("idle");
			copyTimeoutRef.current = null;
		}, 2000);
	};

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

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current !== null) {
				window.clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const activeDocument = document;
	const headerOptions = context?.headerOptions ?? [];
	const warnings = context?.warnings ?? [];
	const shouldShowDocumentFields = useMemo(() => {
		if (!activeDocument) {
			return false;
		}

		if (
			activeDocument.visibleFields !== null &&
			activeDocument.visibleFields.length === 0
		) {
			return false;
		}

		return Object.keys(activeDocument.frontMatter ?? {}).length > 0;
	}, [activeDocument]);

	const toolbarButtonBase =
		"inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-800 disabled:hover:text-slate-300";
	const toolbarButtonDefaultState =
		"border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white";
	const rawDocumentHref = activeDocument
		? buildMarkdownHref(
				documentIdToRoutePath.get(activeDocument.id),
				activeDocument.id,
			)
		: null;
	const repoDetails = context?.repo ?? null;
	const repoButtonHref = useMemo(() => {
		if (!repoDetails || !activeDocument) {
			return null;
		}

		const rawPath =
			activeDocument.workspaceRelativePath ?? activeDocument.relativePath;
		const normalizedSegments = rawPath
			.replace(/\\/gu, "/")
			.split("/")
			.map((segment) => segment.trim())
			.filter((segment) => segment.length > 0);
		const baseUrl = repoDetails.url.trim();
		if (!baseUrl) {
			return null;
		}

		if (normalizedSegments.length === 0) {
			return baseUrl;
		}

		const encodedPath = normalizedSegments
			.map((segment) => encodeURIComponent(segment))
			.join("/");
		const separator = baseUrl.endsWith("/") ? "" : "/";
		return `${baseUrl}${separator}${encodedPath}`;
	}, [repoDetails, activeDocument]);

	const copyButtonLabel =
		copyStatus === "copied"
			? "Copied!"
			: copyStatus === "error"
				? "Copy failed"
				: "Copy link";
	const copyButtonClassName = [
		toolbarButtonBase,
		copyStatus === "copied"
			? "border-emerald-700/60 bg-emerald-600/10 text-emerald-200 hover:border-emerald-600"
			: copyStatus === "error"
				? "border-red-700/60 bg-red-600/10 text-red-200 hover:border-red-600"
				: toolbarButtonDefaultState,
	].join(" ");
	const markdownButtonClassName = [
		toolbarButtonBase,
		toolbarButtonDefaultState,
	].join(" ");
	const repoButtonClassName = [
		toolbarButtonBase,
		toolbarButtonDefaultState,
	].join(" ");
	const repoButtonLabel = repoDetails
		? repoDetails.icon === "gitlab"
			? "View on GitLab"
			: "View on GitHub"
		: null;
	const repoButtonIcon = repoDetails ? (
		repoDetails.icon === "gitlab" ? (
			<svg
				className="size-3.5"
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"
			>
				<path d="M21.922 13.207 20.1 7.611a.732.732 0 0 0-.693-.507.73.73 0 0 0-.693.507l-1.32 4.047H6.606L5.287 7.611a.73.73 0 0 0-.693-.507.73.73 0 0 0-.693.507L2.078 13.207a1.46 1.46 0 0 0 .535 1.62l9.387 6.613 9.387-6.613a1.46 1.46 0 0 0 .535-1.62Z" />
			</svg>
		) : (
			<svg
				className="size-3.5"
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					fillRule="evenodd"
					d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.167 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.528 2.341 1.087 2.91.832.091-.647.35-1.087.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.272.098-2.65 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.748-1.025 2.748-1.025.546 1.378.203 2.397.1 2.65.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.936.359.309.679.92.679 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.58.688.481A10.004 10.004 0 0 0 22 12c0-5.523-4.477-10-10-10Z"
					clipRule="evenodd"
				/>
			</svg>
		)
	) : null;
	const copyStatusMessage =
		copyStatus === "copied"
			? "Link copied to clipboard"
			: copyStatus === "error"
				? "Unable to copy link"
				: "";

	return (
		<div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
			<header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
				<div className="mx-auto flex w-full flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
					<div>
						<h1 className="text-xl font-bold tracking-tight">mdf viewer</h1>
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
									<span className="font-mono text-slate-300">
										{option.value}
									</span>
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
								onSelect={handleSelectDocument}
							/>
							<div className="hidden md:block">
								<div className="mb-3 flex items-center justify-between">
									<h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
										Documents
									</h2>
								</div>
								<NavigationTree
									navigation={context.navigation}
									selectedId={selectedId}
									onSelect={handleSelectDocument}
								/>
							</div>
						</>
					) : (
						<div className="flex items-center gap-2 text-sm text-slate-400">
							<svg
								className="size-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
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
									<svg
										className="size-5 shrink-0 text-yellow-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
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
									<div
										key={warning.filePath}
										className="rounded-md bg-yellow-500/5 p-3"
									>
										<p className="mb-2 font-mono text-sm font-semibold text-yellow-100">
											{warning.filePath}
										</p>
										<ul className="space-y-1 pl-4">
											{warning.messages.map((message, index) => (
												<li
													key={`${warning.filePath}-${index}`}
													className="text-sm text-yellow-200/90"
												>
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
								<svg
									className="size-5 shrink-0 text-red-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<p className="font-bold text-red-100">Error</p>
							</div>
							<p className="p-4 text-sm text-red-200">{error}</p>
						</div>
					)}
					{!context && (
						<div className="flex items-center gap-2 text-sm text-slate-400">
							<svg
								className="size-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Preparing viewer context…
						</div>
					)}
					{route.type === "fm-value" && (
						<FrontMatterValueView
							field={route.field}
							value={route.value}
							onSelectDocument={handleSelectDocument}
						/>
					)}
					{route.type === "fm-field" && context && (
						<FrontMatterFieldView
							field={route.field}
							fields={context.frontMatter}
						/>
					)}
					{route.type === "document" && context && !selectedId && (
						<div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center">
							<svg
								className="mx-auto size-12 text-slate-700"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							<p className="mt-4 text-sm text-slate-400">
								No document selected. Choose one from the navigation.
							</p>
						</div>
					)}
					{route.type === "document" && loadingDocument && (
						<div className="flex items-center gap-2 text-sm text-slate-400">
							<svg
								className="size-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Loading document…
						</div>
					)}
					{route.type === "document" && activeDocument && (
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
								<div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
									<button
										type="button"
										onClick={handleCopyLink}
										className={copyButtonClassName}
										aria-label="Copy page link"
									>
										<svg
											className="size-3.5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M8 7V5a2 2 0 012-2h7a2 2 0 012 2v11a2 2 0 01-2 2h-2M6 7h7a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z"
											/>
										</svg>
										<span>{copyButtonLabel}</span>
									</button>
									{rawDocumentHref ? (
										<a
											href={rawDocumentHref}
											target="_blank"
											rel="noreferrer"
											className={markdownButtonClassName}
											aria-label="Open raw markdown source in a new tab"
										>
											<svg
												className="size-3.5"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={1.5}
													d="M8.25 9.75L5 12l3.25 2.25m7.5-4.5L18 12l-2.25 2.25M13.5 6l-3 12"
												/>
											</svg>
											<span>Show markdown</span>
										</a>
									) : null}
									{repoButtonHref && repoDetails ? (
										<a
											href={repoButtonHref}
											target="_blank"
											rel="noreferrer"
											className={repoButtonClassName}
											aria-label={repoButtonLabel ?? "Open repository"}
										>
											{repoButtonIcon}
											<span>{repoButtonLabel}</span>
										</a>
									) : null}
									{copyStatus !== "idle" ? (
										<span aria-live="polite" className="sr-only">
											{copyStatusMessage}
										</span>
									) : null}
								</div>
							</header>
							<section
								className="article-body prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline"
								// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is generated server-side via trusted markdown parser
								dangerouslySetInnerHTML={{ __html: activeDocument.html }}
							/>
							{shouldShowDocumentFields ? (
								<section className="space-y-4 border-t border-slate-800 pt-8">
									<h3 className="text-xl font-bold tracking-tight text-slate-200">
										List of fields
									</h3>
									<DocumentFrontMatter document={activeDocument} />
								</section>
							) : null}
						</article>
					)}
				</main>
			</div>
		</div>
	);
}
