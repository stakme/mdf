import { defineConfig, z } from "markdfm/config";

export default defineConfig({
	schema: [
		{
			name: "default",
			glob: "**",
			schema: z.object({
				title: z.string(),
				vpath: z.string().optional(),
				status: z.enum(["todo", "in_progress", "done"]).default("todo"),
				author: z.string(),
				tags: z.array(z.string()).default(() => []),
				created_at: z.iso.datetime().default(() => new Date().toISOString()),
				updated_at: z.iso.datetime().default(() => new Date().toISOString()),
			}),
		},
	],
	defaultSchema: "default",

	templates: {
		default: {
			body: ({ title }) => `# ${title}

## What I need

## So I will create...
`,
		},
	},
	defaultTemplate: "default",
	virtualPath: {
		param: "vpath",
		separator: "/",
	},
});
