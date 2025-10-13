import path from "node:path";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Config = {
	darkMode: "class",
	content: [
		path.join(__dirname, "index.html"),
		path.join(__dirname, "src/**/*.{ts,tsx}"),
	],
	theme: {
		extend: {},
	},
	plugins: [typography],
};

export default config;
