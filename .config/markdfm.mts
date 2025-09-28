import { defineConfig, z } from "markdfm/config";

export default defineConfig({
	schema: z.object({
		title: z.string(),
		created_at: z.iso.datetime().default(() => new Date().toISOString()),
		tags: z.array(z.string()).default(() => []),
	}),
});
