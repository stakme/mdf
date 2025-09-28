import { defineConfig, z } from "@stakme/markdfm/config";

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
		bug_report: {
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

	aliases: {
		todo: `list --filter "status=todo" ./TODO`,
		new_bug: `new ./TODO --template bug_report`,
	},
});
