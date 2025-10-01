import type { InvalidFileWarning } from "../types.mts";
import type { ViewerMeta } from "./meta.mts";

export interface ViewerCommandOptions {
	cwd: string;
	directory: string;
	filters?: readonly string[];
	virtualPathPrefix?: string;
	port?: number;
	host?: string;
	strict?: boolean;
	ignoreInvalid?: boolean;
	accessLog?: boolean;
	reload?: boolean;
}

export interface ViewerDocument {
	id: string;
	filePath: string;
	displayPath: string;
	relativePath: string;
	slug: string;
	meta: ViewerMeta;
	frontMatter: Record<string, unknown>;
	html: string;
	markdown: string;
	virtualPathSegments: string[];
	navigationSegments: string[];
}

export interface ViewerHeaderOption {
	label: string;
	value: string;
}

export interface ViewerNavigationDirectory {
	type: "dir";
	name: string;
	children: ViewerNavigationNode[];
}

export interface ViewerNavigationFile {
	type: "file";
	name: string;
	documentId: string;
	routePath: string;
}

export type ViewerNavigationNode =
	| ViewerNavigationDirectory
	| ViewerNavigationFile;

export interface ViewerFrontMatterIndex {
	fields: ViewerFrontMatterField[];
	fieldMap: Map<string, ViewerFrontMatterField>;
}

export interface ViewerFrontMatterField {
	name: string;
	values: ViewerFrontMatterValue[];
	valueMap: Map<string, ViewerFrontMatterValue>;
}

export interface ViewerFrontMatterValue {
	value: string;
	documents: ViewerDocument[];
}

export interface ViewerContext {
	cwd: string;
	directory: string;
	directoryLabel: string;
	headerOptions: ViewerHeaderOption[];
	documents: ViewerDocument[];
	documentMap: Map<string, ViewerDocument>;
	navigation: ViewerNavigationDirectory;
	defaultDocument: ViewerDocument | null;
	frontMatterIndex: ViewerFrontMatterIndex;
	virtualPathParam: string;
	virtualPathSeparator: string;
	warnings: InvalidFileWarning[];
}

export interface ViewerDocumentSummary {
	id: string;
	slug: string;
	displayPath: string;
	relativePath: string;
	meta: ViewerMeta;
}

export interface ViewerDocumentPayload extends ViewerDocumentSummary {
	frontMatter: Record<string, unknown>;
	html: string;
	markdown: string;
}

export interface ViewerFrontMatterValuePayload {
	value: string;
	documentIds: string[];
	documentCount: number;
	documents: ViewerDocumentSummary[];
}

export interface ViewerFrontMatterFieldPayload {
	name: string;
	values: ViewerFrontMatterValuePayload[];
}

export interface ViewerContextPayload {
	directoryLabel: string;
	headerOptions: ViewerHeaderOption[];
	navigation: ViewerNavigationDirectory;
	documents: ViewerDocumentSummary[];
	defaultDocumentId: string | null;
	frontMatter: ViewerFrontMatterFieldPayload[];
	virtualPath: {
		param: string;
		separator: string;
	};
	warnings: InvalidFileWarning[];
}
