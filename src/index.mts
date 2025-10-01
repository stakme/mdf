import { z } from "zod";
import type {
	MdfConfig,
	MdfConfigWithRecord,
	SchemaDefinitionInput,
	SchemaRecordInput,
} from "./types.mts";

export { z };
export type {
	AnySchemaDefinition,
	DocumentSort,
	LoadedVirtualPathConfig,
	MdfConfig,
	MdfConfigWithRecord,
	SchemaConfig,
	SchemaDefinition,
	SchemaDefinitionInput,
	SchemaEntryInput,
	SchemaRecordInput,
	TemplateBodyResolver,
	TemplateConfigEntry,
	TemplatesConfig,
	VirtualPathConfig,
} from "./types.mts";

export function defineSchema<TSchema extends z.ZodTypeAny>(
	definition: SchemaDefinitionInput<TSchema>,
): SchemaDefinitionInput<TSchema> {
	return definition;
}

export function defineConfig<TSchemaRecord extends SchemaRecordInput>(
	config: MdfConfigWithRecord<TSchemaRecord>,
): MdfConfig<TSchemaRecord>;
export function defineConfig<TSchemaRecord extends SchemaRecordInput>(
	config: MdfConfig<TSchemaRecord>,
): MdfConfig<TSchemaRecord>;
export function defineConfig<TSchemaRecord extends SchemaRecordInput>(
	config: MdfConfig<TSchemaRecord>,
): MdfConfig<TSchemaRecord> {
	return config;
}

export type {
	ViewerCommandOptions,
	ViewerContext,
	ViewerContextPayload,
	ViewerDocument,
	ViewerDocumentPayload,
	ViewerDocumentSummary,
	ViewerFrontMatterFieldPayload,
	ViewerFrontMatterValuePayload,
	ViewerHeaderOption,
	ViewerNavigationDirectory,
	ViewerNavigationFile,
	ViewerNavigationNode,
} from "./viewer/types.mts";
