import { z } from "zod";
import type { MarkdfmConfig } from "./types.mts";

export { z };
export type {
	LoadedVirtualPathConfig,
	MarkdfmConfig,
	SchemaDefinition,
	VirtualPathConfig,
} from "./types.mts";

export function defineConfig<TSchema extends z.ZodTypeAny>(
	config: MarkdfmConfig<TSchema>,
): MarkdfmConfig<TSchema> {
	return config;
}
