// @ts-check

import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [mdx()],
	vite: {
		plugins: [tailwindcss()],
	},
	markdown: {
		shikiConfig: {
			themes: {
				light: "github-light",
				dark: "github-dark",
			},
		},
	},
});
