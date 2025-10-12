import type {
	ViewerDocumentPayload,
	ViewerFrontMatterFieldPayload,
	ViewerFrontMatterValuePayload,
} from "@stakme/mdf/viewer-types";
import { useEffect, useMemo, useState } from "react";

import { fetchJson } from "../utils/fetchJson";

export interface FrontMatterValueViewProps {
	field: string;
	value: string;
	onSelectDocument(id: string, routePath: string): void;
}

export function FrontMatterValueView({
	field,
	value,
	onSelectDocument,
}: FrontMatterValueViewProps) {
	const [data, setData] = useState<ViewerFrontMatterValuePayload | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		setError(null);
		fetchJson<ViewerFrontMatterValuePayload>(
			`/api/front-matter/${encodeURIComponent(field)}/${encodeURIComponent(value)}/index.json`,
		)
			.then((payload) => {
				setData(payload);
				setLoading(false);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});
	}, [field, value]);

	if (loading) {
		return (
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
				Loading...
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-lg border border-red-700/50 bg-red-500/10 p-4 text-sm text-red-200">
				{error}
			</div>
		);
	}

	if (!data) {
		return null;
	}

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6">
			<div>
				<div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
					<a href="#/fm" className="transition-colors hover:text-slate-300">
						Properties
					</a>
					<span>›</span>
					<a
						href={`#/fm/${encodeURIComponent(field)}`}
						className="transition-colors hover:text-slate-300"
					>
						{field}
					</a>
					<span>›</span>
					<span className="text-slate-300">{value}</span>
				</div>
				<h1 className="text-3xl font-bold tracking-tight text-slate-50">
					{value}
				</h1>
				<p className="mt-2 text-sm text-slate-400">
					{data.documentCount}{" "}
					{data.documentCount === 1 ? "document" : "documents"} with {field} ={" "}
					{value}
				</p>
			</div>

			<div className="space-y-2">
				{data.documents.map((doc) => (
					<button
						key={doc.id}
						type="button"
						onClick={() => {
							onSelectDocument(doc.id, doc.meta.routePath);
						}}
						className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-700 hover:bg-slate-900/80"
					>
						<svg
							className="mt-1 size-5 shrink-0 text-slate-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
						<div className="flex-1 overflow-hidden">
							<div className="font-semibold text-slate-100">
								{doc.meta.title || doc.displayPath}
							</div>
							{doc.meta.description && (
								<p className="mt-1 text-sm text-slate-400">
									{doc.meta.description}
								</p>
							)}
							<div className="mt-2 text-xs text-slate-600">
								{doc.displayPath}
							</div>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

export interface FrontMatterFieldViewProps {
	field: string;
	fields: ViewerFrontMatterFieldPayload[];
}

export function FrontMatterFieldView({
	field,
	fields,
}: FrontMatterFieldViewProps) {
	const fieldData = fields.find((f) => f.name === field);

	if (!fieldData) {
		return (
			<div className="mx-auto w-full max-w-4xl">
				<div className="rounded-lg border border-red-700/50 bg-red-500/10 p-4 text-sm text-red-200">
					Field "{field}" not found
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6">
			<div>
				<div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
					<a href="#/fm" className="transition-colors hover:text-slate-300">
						Properties
					</a>
					<span>›</span>
					<span className="text-slate-300">{field}</span>
				</div>
				<h1 className="text-3xl font-bold tracking-tight text-slate-50">
					{field}
				</h1>
				<p className="mt-2 text-sm text-slate-400">
					{fieldData.values.length}{" "}
					{fieldData.values.length === 1 ? "value" : "values"}
				</p>
			</div>

			<div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
				<table className="min-w-full divide-y divide-slate-800">
					<thead>
						<tr className="bg-slate-900/40 text-xs uppercase tracking-wide text-slate-400">
							<th scope="col" className="px-4 py-3 text-left font-semibold">
								Value
							</th>
							<th scope="col" className="px-4 py-3 text-left font-semibold">
								Documents
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-800 text-sm text-slate-300">
						{fieldData.values.map((item) => (
							<tr
								key={item.value}
								className="transition-colors hover:bg-slate-900/80"
							>
								<td className="px-4 py-3">
									<a
										href={`#/fm/${encodeURIComponent(field)}/${encodeURIComponent(item.value)}`}
										className="text-sky-400 transition-colors hover:text-sky-300 hover:underline"
									>
										{item.value}
									</a>
								</td>
								<td className="px-4 py-3">
									<span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
										{item.count}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export function DocumentFrontMatter({
	document,
}: {
	document: ViewerDocumentPayload;
}) {
	const entries = useMemo(() => {
		const allEntries = Object.entries(document.frontMatter ?? {});
		if (allEntries.length === 0) {
			return [] as [string, unknown][];
		}

		if (document.visibleFields === null) {
			return [...allEntries].sort((a, b) =>
				a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
			);
		}

		const order = new Map(
			document.visibleFields.map((field, index) => [field, index] as const),
		);

		return allEntries
			.filter(([key]) => order.has(key))
			.sort((a, b) => {
				const left = order.get(a[0]);
				const right = order.get(b[0]);
				if (left === undefined && right === undefined) {
					return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
				}
				if (left === undefined) {
					return 1;
				}
				if (right === undefined) {
					return -1;
				}
				return (left ?? 0) - (right ?? 0);
			});
	}, [document.frontMatter, document.visibleFields]);

	if (!entries.length) {
		return null;
	}

	return (
		<dl className="grid gap-4 sm:grid-cols-2">
			{entries.map(([key, value]) => (
				<div
					key={key}
					className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60 transition-colors hover:border-slate-700"
				>
					<dt className="border-b border-slate-800/50 bg-slate-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
						{key}
					</dt>
					<dd className="px-4 py-3">{renderFrontMatterValue(key, value)}</dd>
				</div>
			))}
		</dl>
	);
}

function renderFrontMatterValue(
	fieldName: string,
	value: unknown,
): JSX.Element {
	const renderSingleValue = (val: unknown): JSX.Element => {
		if (val === null || val === undefined) {
			return <span className="text-sm text-slate-500">—</span>;
		}

		const stringValue = val instanceof Date ? val.toISOString() : String(val);

		return (
			<a
				href={`#/fm/${encodeURIComponent(fieldName)}/${encodeURIComponent(stringValue)}`}
				className="inline-block text-sm text-sky-400 transition-colors hover:text-sky-300 hover:underline"
			>
				{stringValue}
			</a>
		);
	};

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return <span className="text-sm text-slate-500">—</span>;
		}
		return (
			<div className="flex flex-wrap gap-2">
				{value.map((item) => {
					const stringValue =
						item instanceof Date ? item.toISOString() : String(item);
					return <span key={stringValue}>{renderSingleValue(item)}</span>;
				})}
			</div>
		);
	}

	if (typeof value === "object" && value !== null) {
		try {
			return (
				<code className="block overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-300">
					{JSON.stringify(value, null, 2)}
				</code>
			);
		} catch {
			return <span className="text-sm text-slate-300">{String(value)}</span>;
		}
	}

	return renderSingleValue(value);
}
