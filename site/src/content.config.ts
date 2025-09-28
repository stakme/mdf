import { defineCollection } from "astro:content";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docsDir = process.env.MDF_DOCS_DIR
	? path.resolve(process.env.MDF_DOCS_DIR)
	: fileURLToPath(new URL("../../docs", import.meta.url));

const frontMatterSchema = z.record(z.unknown());

export const collections = {
	pages: defineCollection({
		loader: glob({
			base: docsDir,
			pattern: "**/*.{md,mdx}",
		}),
		schema: frontMatterSchema,
	}),
};
