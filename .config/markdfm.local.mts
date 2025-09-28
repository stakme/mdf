import { defineConfig, z } from "@stakme/markdfm/config";

export default defineConfig({
	schema: z.object({
		author: z.string().default("@stakme"),
	}),
});
