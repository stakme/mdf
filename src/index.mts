import { z } from "zod";
import type { MdfConfig } from "./types.mts";

export { z };
export type {
	AnySchemaDefinition,
	LoadedVirtualPathConfig,
	MdfConfig,
	SchemaDefinition,
	VirtualPathConfig,
} from "./types.mts";

export function defineConfig<TSchema extends z.ZodTypeAny>(
	config: MdfConfig<TSchema>,
): MdfConfig<TSchema> {
	return config;
}
