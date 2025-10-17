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
	DefaultSchemaConfig,
	DefaultTemplateConfig,
	DocumentSort,
	MdfConfig,
	MdfConfigWithRecord,
	RepoConfig,
	RepoIcon,
	SchemaConfig,
	SchemaDefinition,
	SchemaDefinitionInput,
	SchemaEntryInput,
	SchemaFilenameResolver,
	SchemaRecordInput,
	SchemaVirtualPathResolver,
	SchemaVirtualResolverContext,
	SchemaVirtualSlugResolver,
	TemplateBodyResolver,
	TemplateConfigEntry,
	TemplatesConfig,
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
	ViewerRepoIcon,
	ViewerRepoLink,
} from "./viewer/types.mts";
