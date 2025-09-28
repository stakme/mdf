import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
	schema: z.object({
		author: z.string().default("@stakme"),
	}),
});
