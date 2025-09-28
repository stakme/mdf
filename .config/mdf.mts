import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
	aliases: {
		todo: `list --filter "status=todo" ./TODO`,
		new_bug: `new ./TODO --template bug_report`,
		close: `update --fm "status=done" --fm updated_at`,
	},

	schema: [
		{
			name: "docs",
			glob: "docs/**",
			schema: z.object({
				title: z.string().min(1),
				description: z.string().optional(),
				vpath: z.string().min(1),
				date: z.iso.date().optional(),
				tags: z.array(z.string()).default(() => []),
				draft: z.boolean().default(false),
				author: z.string().optional(),
			}),
		},
		{
			name: "default",
			glob: "**",
			schema: z.object({
				title: z.string().min(1),
				vpath: z.string().optional(),
				status: z.enum(["todo", "in_progress", "done"]).default("todo"),
				author: z.string().optional(),
				tags: z.array(z.string()).default(() => []),
				created_at: z.iso.datetime().default(() => new Date().toISOString()),
				updated_at: z.iso.datetime().default(() => new Date().toISOString()),
			}),
		},
	],
	defaultSchema: "default",

	templates: {
		default: {
			schema: "default",
			body: ({ title }) => `# ${title}

## What I need

## So I will create...
`,
		},
		bug_report: {
			schema: "default",
			frontmatter: {
				title: "[Bug] Brief summary",
				vpath: "bug_reports",
				status: "todo",
				tags: ["bug"],
			},
			body: ({ title }) => `# ${title}

## Summary
Provide a concise description of the issue.

## Steps to Reproduce

1. 
2. 
3. 

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Environment
- OS:
- Node.js:
- App/Package Version:

## Additional Context
Logs, screenshots, or notes.
`,
		},
	},
	defaultTemplate: "default",
	virtualPath: {
		param: "vpath",
		separator: "/",
	},
});
