import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
	root: __dirname,
	plugins: [react()],
	resolve: {
		alias: {
			"@stakme/mdf/viewer-types": path.resolve(
				__dirname,
				"../src/viewer/types.mts",
			),
		},
	},
	build: {
		outDir: path.resolve(__dirname, "../dist/viewer"),
		emptyOutDir: true,
		manifest: true,
		sourcemap: true,
	},
	css: {
		postcss: path.resolve(__dirname, "./postcss.config.cjs"),
	},
});
