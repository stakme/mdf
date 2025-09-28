import { z } from "zod";
import type { MdfConfig, SchemaRecordInput } from "./types.mts";

export { z };
export type {
	AnySchemaDefinition,
	LoadedVirtualPathConfig,
	MdfConfig,
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
	config: MdfConfig<TSchemaRecord>,
): MdfConfig<TSchemaRecord> {
	return config;
}
