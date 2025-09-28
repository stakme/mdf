import { defineConfig, z } from "markdfm/config";

export default defineConfig({
	schema: z.object({
		title: z.string(),
		status: z.enum(["todo", "in_progress", "done"]).default("todo"),
		tags: z.array(z.string()).default(() => []),
		created_at: z.iso.datetime().default(() => new Date().toISOString()),
	}),
});
