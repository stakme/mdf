import { z } from "zod";
import type {
	MdfConfig,
	MdfConfigWithRecord,
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
	SchemaEntryInput,
	SchemaRecordInput,
	TemplateBodyResolver,
	TemplateConfigEntry,
	TemplatesConfig,
	VirtualPathConfig,
} from "./types.mts";

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
