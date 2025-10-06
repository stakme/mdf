import { defineConfig, defineSchema, z } from "@stakme/mdf/config";

export default defineConfig({
	aliases: {
		todo: `list --filter "status=todo" ./TODO`,
		new_bug: `new ./TODO --template bug_report`,
		close: `update --fm "status=done" --fm updated_at`,
	},

	schema: {
                docs: defineSchema({
                        glob: "docs/**",
                        schema: z.object({
                                title: z.string().min(1).default("title"),
                                description: z.string().optional(),
                                vpath: z.string().min(1).default("/"),
                                date: z.iso.date().optional(),
                                tags: z.array(z.string()).default(() => []),
                                draft: z.boolean().default(false),
                                chapter: z.number().default(0),
                        }),
                        sort: (a, b) => a.chapter - b.chapter,
                        visibleFields: ["tags"],
                }),
		default: defineSchema({
			glob: "**",
			schema: z.object({
				title: z.string(),
				vpath: z.string().optional(),
				status: z.enum(["todo", "in_progress", "done"]).default("todo"),
				author: z.string().optional(),
				tags: z.array(z.string()).default(() => []),
				created_at: z.iso.datetime().default(() => new Date().toISOString()),
				updated_at: z.iso.datetime().default(() => new Date().toISOString()),
			}),
			sort: (a, b) => a.created_at.localeCompare(b.created_at),
		}),
	},
	defaultSchema: ["docs", "default"],

	templates: {
		backlog: {
			schema: "default",
			frontmatter: {
				title: "",
			},
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
	defaultTemplate: {
		default: "backlog",
	},
	virtualPath: {
		param: "vpath",
		separator: "/",
	},
});
