import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: {
			index: "src/index.mts",
			config: "src/config-entry.mts",
		},
		format: "esm",
		target: "node22",
		sourcemap: true,
		clean: ["dist"],
		dts: true,
		bundleDts: true,
		outDir: "dist",
		fixedExtension: true,
		skipNodeModulesBundle: true,
	},
	{
		entry: {
			cli: "src/cli.mts",
		},
		format: "esm",
		target: "node22",
		sourcemap: true,
		clean: false,
		dts: false,
		outDir: "dist",
		fixedExtension: true,
		skipNodeModulesBundle: true,
		// ensure shebang preserved by re-applying after build via plugin? we'll handle post build
	},
]);
