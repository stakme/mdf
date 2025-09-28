import { defineCollection } from "astro:content";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docsDir = process.env.MDF_DOCS_DIR
	? path.resolve(process.env.MDF_DOCS_DIR)
	: fileURLToPath(new URL("../../docs", import.meta.url));

export const collections = {
	pages: defineCollection({
		loader: glob({
			base: docsDir,
			pattern: "**/*.{md,mdx}",
		}),
		schema: z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			date: z.string().optional(),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
			vpath: z.string().optional(),
			status: z.string().optional(),
		}),
	}),
};
