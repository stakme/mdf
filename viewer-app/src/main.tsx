import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "highlight.js/styles/github-dark-dimmed.css";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Failed to find root element for viewer app");
}

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
